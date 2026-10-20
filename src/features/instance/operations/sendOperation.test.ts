/** @vitest-environment jsdom */
import { MAX_RESPONSE_BYTES, sendOperation } from '@/features/instance/operations/sendOperation';
import { AxiosError, type AxiosProgressEvent, CanceledError, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/sleep', () => ({ sleep: vi.fn().mockResolvedValue(true) }));

const { getInstanceClient } = await import('@/config/getInstanceClient');
const { markRestarting } = await import('@/lib/restart/restartTracker');

const ENTITY_ID = 'ins-operations';

type Adapter = (config: InternalAxiosRequestConfig) => Promise<unknown>;

function respond(config: InternalAxiosRequestConfig, status: number, data: string, contentType = 'application/json') {
	const response = {
		status,
		statusText: status === 200 ? 'OK' : 'Bad Gateway',
		data,
		headers: { 'content-type': contentType },
		config,
	};
	if (status >= 200 && status < 300) {
		return response;
	}
	// Status validation lives in axios's built-in adapters, so a custom one has to reject itself.
	throw new AxiosError(
		`Request failed with status code ${status}`,
		AxiosError.ERR_BAD_RESPONSE,
		config,
		undefined,
		response,
	);
}

let sent: InternalAxiosRequestConfig[] = [];

/** The real instance client — restart gate, replication check and gateway retry all installed. */
function clientServing(adapter: Adapter) {
	const client = getInstanceClient({ id: ENTITY_ID, operationsUrl: 'https://ins-operations.example.com:9925/' });
	client.defaults.adapter = (config) => {
		sent.push(config);
		return adapter(config) as never;
	};
	return client;
}

beforeEach(() => {
	sent = [];
});

describe('sendOperation', () => {
	it('sends the typed text as-is, so integers past 2^53 reach Harper intact', async () => {
		const text = '{"operation":"search_by_id","database":"dev","table":"dog","ids":[9007199254740993]}';
		const client = clientServing(async (config) => respond(config, 200, '[]'));

		await sendOperation(client, `  ${text}\n`);

		expect(sent).toHaveLength(1);
		expect(sent[0].data).toBe(text);
		expect(String(sent[0].headers['Content-Type'])).toContain('application/json');
	});

	it('pretty-prints a JSON answer and reports its status', async () => {
		const client = clientServing(async (config) => respond(config, 200, '{"message":"ok","count":2}'));
		const clock = [100, 142];

		const result = await sendOperation(client, '{"operation":"describe_all"}', { now: () => clock.shift()! });

		expect(result).toEqual({
			kind: 'response',
			status: 200,
			statusText: 'OK',
			durationMs: 42,
			body: '{\n\t"message": "ok",\n\t"count": 2\n}',
		});
	});

	it('renders a non-JSON answer as the text Harper sent', async () => {
		const client = clientServing(async (config) => respond(config, 200, 'not { json', 'text/plain'));

		const result = await sendOperation(client, '{"operation":"describe_all"}');

		expect(result).toMatchObject({ kind: 'response', body: 'not { json' });
	});

	it("shows Harper's error answer rather than throwing", async () => {
		const client = clientServing(async (config) => respond(config, 400, '{"error":"Table \'dog\' does not exist"}'));

		const result = await sendOperation(client, '{"operation":"drop_table","table":"dog"}');

		expect(result).toMatchObject({
			kind: 'response',
			status: 400,
			body: '{\n\t"error": "Table \'dog\' does not exist"\n}',
		});
	});

	it.each([502, 503, 504])('sends exactly once when the gateway answers %i', async (status) => {
		const client = clientServing(async (config) => respond(config, status, '{"error":"upstream"}'));

		const result = await sendOperation(client, '{"operation":"insert","records":[{"name":"Harper"}]}');

		expect(sent).toHaveLength(1);
		expect(result).toMatchObject({ kind: 'response', status });
	});

	it('still retries a gateway error for every other request on the same client', async () => {
		let attempts = 0;
		const client = clientServing(async (config) => {
			attempts += 1;
			return attempts === 1 ? respond(config, 502, '') : respond(config, 200, '{}');
		});

		await client.post('/', { operation: 'describe_all' });

		expect(sent).toHaveLength(2);
	});

	it('stops downloading a response past the size cap instead of buffering all of it', async () => {
		const client = clientServing(async (config) => {
			config.onDownloadProgress?.(
				{ loaded: MAX_RESPONSE_BYTES + 1, bytes: MAX_RESPONSE_BYTES + 1 } as AxiosProgressEvent,
			);
			if (config.signal?.aborted) {
				throw new CanceledError(undefined, config);
			}
			return respond(config, 200, 'x'.repeat(10));
		});

		const result = await sendOperation(client, '{"operation":"search_by_value","search_value":"*"}');

		expect(result).toMatchObject({ kind: 'too-large' });
	});

	it('keeps downloading a response under the cap', async () => {
		const client = clientServing(async (config) => {
			config.onDownloadProgress?.({ loaded: MAX_RESPONSE_BYTES, bytes: MAX_RESPONSE_BYTES } as AxiosProgressEvent);
			return respond(config, 200, '{}');
		});

		const result = await sendOperation(client, '{"operation":"describe_all"}');

		expect(result).toMatchObject({ kind: 'response', status: 200 });
	});

	it('says an unanswered write may already have run', async () => {
		const client = clientServing(async (config) => {
			throw new AxiosError('timeout of 60000ms exceeded', AxiosError.ECONNABORTED, config);
		});

		const result = await sendOperation(client, '{"operation":"restart"}');

		expect(result).toMatchObject({ kind: 'failed', message: 'timeout of 60000ms exceeded', mayHaveRun: true });
	});

	describe('while the instance is tracked as restarting', () => {
		let release: () => void = () => {};
		beforeEach(() => {
			release = markRestarting([ENTITY_ID], { reach: 'down', ttlMs: 60_000 });
		});
		afterEach(() => release());

		it('says a write the restart gate refused was never sent', async () => {
			const client = clientServing(async (config) => respond(config, 200, '{}'));

			const result = await sendOperation(client, '{"operation":"insert"}');

			expect(sent).toHaveLength(0);
			expect(result).toMatchObject({
				kind: 'failed',
				message: "This instance is restarting. Try again once it's back online.",
				mayHaveRun: false,
			});
		});

		it('sends past the gate when asked to, as the restart it is driving must', async () => {
			const client = clientServing(async (config) => respond(config, 200, '{"message":"Restarting"}'));

			const result = await sendOperation(client, '{"operation":"restart"}', { skipRestartGate: true });

			expect(sent).toHaveLength(1);
			expect(result).toMatchObject({ kind: 'response', status: 200 });
		});
	});

	it('never sends when its caller is already gone', async () => {
		const caller = new AbortController();
		caller.abort();
		const client = clientServing(async (config) => respond(config, 200, '{}'));

		const result = await sendOperation(client, '{"operation":"insert"}', { signal: caller.signal });

		expect(sent).toHaveLength(0);
		expect(result).toMatchObject({ kind: 'failed', mayHaveRun: false });
	});

	it('says a request abandoned mid-flight may still have run', async () => {
		const caller = new AbortController();
		const client = clientServing(async (config) => {
			caller.abort();
			if (config.signal?.aborted) {
				throw new CanceledError(undefined, config);
			}
			return respond(config, 200, '{}');
		});

		const result = await sendOperation(client, '{"operation":"insert"}', { signal: caller.signal });

		expect(sent).toHaveLength(1);
		expect(result).toMatchObject({
			kind: 'failed',
			message: 'Studio stopped waiting for the answer.',
			mayHaveRun: true,
		});
	});

	it("says a request Studio cancelled before sending, because its connection changed, didn't run", async () => {
		const client = clientServing(async (config) => {
			throw new AxiosError(
				'Connection replaced before this request could be retried.',
				AxiosError.ERR_CANCELED,
				config,
			);
		});

		const result = await sendOperation(client, '{"operation":"insert"}');

		expect(result).toMatchObject({
			kind: 'failed',
			message: 'Connection replaced before this request could be retried.',
			mayHaveRun: false,
		});
	});
});
