/** @vitest-environment jsdom */
import { getInstanceClient } from '@/config/getInstanceClient';
import { restartInstance } from '@/integrations/api/instance/status/restartInstance';
import { RestartUnconfirmedError } from '@/integrations/api/instance/status/restartUnconfirmed';
import { isUnansweredWrite } from '@/integrations/api/unansweredWrite';
import { shouldKeepEvent } from '@/integrations/datadog/shouldKeepEvent';
import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/sleep', () => ({
	sleep: vi.fn().mockResolvedValue(true),
}));

type Answer = (config: InternalAxiosRequestConfig, attempt: number) => AxiosResponse | never;

// Harper's own answer to an accepted `restart` (bin/restart.ts RESTART_RESPONSE, wrapped as { message }).
const ACCEPTED = { message: 'Restarting Harper. This may take up to 60 seconds.' };

function ok(data: unknown): Answer {
	return (config) => ({ status: 200, statusText: 'OK', data, headers: {}, config });
}

function failing(status: number, data: unknown): Answer {
	return (config) => {
		throw new AxiosError(
			`Request failed with status code ${status}`,
			status >= 500 ? AxiosError.ERR_BAD_RESPONSE : AxiosError.ERR_BAD_REQUEST,
			config,
			undefined,
			{ status, statusText: '', data, headers: {}, config },
		);
	};
}

function timingOut(config: InternalAxiosRequestConfig): never {
	throw new AxiosError(`timeout of ${config.timeout}ms exceeded`, AxiosError.ECONNABORTED, config);
}

function answersFrom(attempt: number): Answer {
	return (config, probe) => probe < attempt ? timingOut(config) : ok({ username: 'admin' })(config, probe);
}

const sent: string[] = [];

function instanceClient({ restart, userInfo }: { restart: Answer; userInfo: Answer }) {
	let probes = 0;
	const client = getInstanceClient({ id: 'ins-restart', operationsUrl: 'https://ins-restart.example.com:9925/' });
	client.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
		const { operation } = JSON.parse(String(config.data)) as { operation: string };
		sent.push(operation);
		return operation === 'user_info' ? userInfo(config, ++probes) : restart(config, 0);
	};
	return client;
}

const probesSent = () => sent.filter((operation) => operation === 'user_info').length;

async function failureOf(promise: Promise<unknown>): Promise<unknown> {
	return promise.then(() => expect.unreachable('the restart should have been rejected'), (error: unknown) => error);
}

describe('restartInstance', () => {
	beforeEach(() => {
		sent.length = 0;
	});

	it('resolves with Harper’s answer once the target answers again', async () => {
		const client = instanceClient({ restart: ok(ACCEPTED), userInfo: ok({ username: 'admin' }) });

		await expect(restartInstance({ operation: 'restart', replicated: false, instanceClient: client }))
			.resolves.toEqual(ACCEPTED);
		expect(sent).toEqual(['restart', 'user_info']);
	});

	it('keeps watching a target that is slow to come back, and says so once', async () => {
		const client = instanceClient({ restart: ok(ACCEPTED), userInfo: answersFrom(20) });
		const onSlowToReturn = vi.fn();

		await expect(restartInstance({ operation: 'restart', replicated: false, instanceClient: client, onSlowToReturn }))
			.resolves.toEqual(ACCEPTED);
		expect(probesSent()).toBe(20);
		expect(onSlowToReturn).toHaveBeenCalledOnce();
	});

	it('does not call a target slow that answers within the usual time', async () => {
		const client = instanceClient({ restart: ok(ACCEPTED), userInfo: answersFrom(12) });
		const onSlowToReturn = vi.fn();

		await restartInstance({ operation: 'restart', replicated: false, instanceClient: client, onSlowToReturn });

		expect(onSlowToReturn).not.toHaveBeenCalled();
	});

	it('says an accepted restart is unconfirmed, not failed, when the target never answers again', async () => {
		const client = instanceClient({ restart: ok(ACCEPTED), userInfo: timingOut });

		const error = await failureOf(restartInstance({ operation: 'restart', replicated: false, instanceClient: client }));

		expect(error).toBeInstanceOf(RestartUnconfirmedError);
		expect((error as RestartUnconfirmedError).cause).toBeInstanceOf(AxiosError);
		expect((error as RestartUnconfirmedError).cause).toMatchObject({ code: AxiosError.ECONNABORTED });
		// Sent once: Harper accepted it, so nothing here may send it again.
		expect(sent.filter((operation) => operation === 'restart')).toHaveLength(1);
		expect(probesSent()).toBe(24);
	});

	it('sends each probe once, even when a gateway answers it', async () => {
		const client = instanceClient({ restart: ok(ACCEPTED), userInfo: failing(503, 'Service Unavailable') });

		const error = await failureOf(restartInstance({ operation: 'restart', replicated: false, instanceClient: client }));

		expect(error).toBeInstanceOf(RestartUnconfirmedError);
		expect(probesSent()).toBe(24);
	});

	it('treats restart_service the same way: its job started, so the restart was accepted', async () => {
		const client = instanceClient({
			restart: ok({ message: 'Restarting http', job_id: 'job-1' }),
			userInfo: timingOut,
		});

		const error = await failureOf(
			restartInstance({ operation: 'restart_service', replicated: false, instanceClient: client }),
		);

		expect(error).toBeInstanceOf(RestartUnconfirmedError);
	});

	it.each([
		['refused', failing(403, { error: 'This operation is restricted to super users' })],
		['answered by a gateway', failing(504, '<html>504 Gateway Time-out</html>')],
		['never answered', timingOut],
	])('rejects with the restart request’s own error when it was %s', async (_label, restart) => {
		const client = instanceClient({ restart, userInfo: ok({ username: 'admin' }) });

		const error = await failureOf(restartInstance({ operation: 'restart', replicated: false, instanceClient: client }));

		expect(error).toBeInstanceOf(AxiosError);
		expect(error).not.toBeInstanceOf(RestartUnconfirmedError);
		expect(sent).not.toContain('user_info');
	});

	it('leaves a restart that got no verdict to the unanswered-write warning', async () => {
		const client = instanceClient({ restart: failing(504, 'gateway'), userInfo: ok({}) });

		const error = await failureOf(restartInstance({ operation: 'restart', replicated: false, instanceClient: client }));

		expect(isUnansweredWrite(error)).toBe(true);
	});
});

describe('RestartUnconfirmedError', () => {
	function consoleEvent(error: Error) {
		return { type: 'error', error: { message: error.message, type: error.name, source: 'console' } };
	}

	it('reaches RUM, or not, exactly as the probe failure it wraps would', () => {
		const timeout = new AxiosError('timeout of 3000ms exceeded', AxiosError.ECONNABORTED);
		const network = new AxiosError('Network Error', AxiosError.ERR_NETWORK);

		for (const probeFailure of [timeout, network]) {
			expect(shouldKeepEvent(consoleEvent(new RestartUnconfirmedError(probeFailure))))
				.toBe(shouldKeepEvent(consoleEvent(probeFailure)));
		}
		expect(shouldKeepEvent(consoleEvent(new RestartUnconfirmedError(timeout)))).toBe(false);
	});

	it.each([null, undefined, 'socket hang up', { code: 'E_SOMETHING' }])('accepts any cause (%o)', (cause) => {
		const error = new RestartUnconfirmedError(cause);

		expect(error.cause).toBe(cause);
		expect(error.message).toMatch(/^The restart was accepted, but the target has not answered since: /);
	});
});
