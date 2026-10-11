/** @vitest-environment jsdom */
import { getInstanceClient } from '@/config/getInstanceClient';
import * as sleepModule from '@/lib/sleep';
import { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/sleep', () => ({
	sleep: vi.fn().mockResolvedValue(true),
}));

const OPERATIONS_URL = 'https://ins-123.example.com:9925/';

/**
 * A target behind a gateway that answers `statuses` in turn, then 200. Axios applies
 * `validateStatus` inside its own adapters, so this one rejects a non-2xx itself.
 */
function gateway(...statuses: number[]) {
	const sent: Array<{ method?: string; body: unknown }> = [];
	const client = getInstanceClient({ id: 'ins-123', operationsUrl: OPERATIONS_URL });
	client.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
		sent.push({ method: config.method, body: typeof config.data === 'string' ? JSON.parse(config.data) : config.data });
		const status = statuses.shift() ?? 200;
		const response = { status, statusText: '', data: { status }, headers: {}, config };
		if (status >= 400) {
			throw new AxiosError(
				`Request failed with status code ${status}`,
				AxiosError.ERR_BAD_RESPONSE,
				config,
				undefined,
				response,
			);
		}
		return response;
	};
	return { client, sent };
}

function statusOf(error: unknown): number | undefined {
	return (error as AxiosError).response?.status;
}

describe('the gateway retry on a real instance client', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it.each([502, 503, 504])('sends a write once and surfaces its %i', async (status) => {
		const { client, sent } = gateway(status, status, status, status);

		const error = await client.post('/', { operation: 'insert', records: [{ name: 'a' }] }).catch((e: unknown) => e);

		expect(statusOf(error)).toBe(status);
		expect(sent).toEqual([{ method: 'post', body: { operation: 'insert', records: [{ name: 'a' }] } }]);
		expect(sleepModule.sleep).not.toHaveBeenCalled();
	});

	it.each(['drop_table', 'deploy_component', 'set_configuration', 'restart', 'create_authentication_tokens'])(
		'never replays %s',
		async (operation) => {
			const { client, sent } = gateway(504);

			await expect(client.post('/', { operation })).rejects.toBeInstanceOf(AxiosError);
			expect(sent).toHaveLength(1);
		},
	);

	it.each([502, 503, 504])('replays a read three times on a %i, 5s/10s/20s apart, as before', async (status) => {
		const { client, sent } = gateway(status, status, status, status);

		const error = await client.post('/', { operation: 'describe_all' }).catch((e: unknown) => e);

		expect(statusOf(error)).toBe(status);
		expect(sent).toHaveLength(4);
		expect(sent.every(({ body }) => (body as { operation: string }).operation === 'describe_all')).toBe(true);
		expect(vi.mocked(sleepModule.sleep).mock.calls).toEqual([[5_000], [10_000], [20_000]]);
	});

	it('returns the answer to a read that recovers on its replay', async () => {
		const { client, sent } = gateway(503);

		const { data } = await client.post('/', { operation: 'get_job', id: 'job-1' });

		expect(data).toEqual({ status: 200 });
		expect(sent).toHaveLength(2);
	});

	it('replays a GET', async () => {
		const { client, sent } = gateway(502, 502);

		await expect(client.get('/health')).resolves.toMatchObject({ status: 200 });
		expect(sent).toHaveLength(3);
	});

	it('sends a read that opted out once', async () => {
		const { client, sent } = gateway(503);

		await expect(client.post('/', { operation: 'describe_all' }, { skipGatewayRetry: true })).rejects
			.toBeInstanceOf(AxiosError);
		expect(sent).toHaveLength(1);
	});
});
