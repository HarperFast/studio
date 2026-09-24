/** @vitest-environment jsdom */
import { getInstanceClient } from '@/config/getInstanceClient';
import { authStore } from '@/features/auth/store/authStore';
import { isConnectivityFailure, isRestartNoise, RESTARTING_ERROR_CODE } from '@/lib/restart/restartGate';
import { markRestarting, resetRestartTracker, syncRestartsFromCluster } from '@/lib/restart/restartTracker';
import { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const INSTANCE_ID = 'ins-123';
const CLUSTER_ID = 'clu-123';

function clientWithAdapter(options: Parameters<typeof getInstanceClient>[0] = {}) {
	const client = getInstanceClient({ id: INSTANCE_ID, ...options });
	const sent: InternalAxiosRequestConfig[] = [];
	client.defaults.adapter = async (config) => {
		sent.push(config);
		return { data: { ok: true }, status: 200, statusText: 'OK', headers: {}, config };
	};
	return { client, sent };
}

describe('the restart gate on instance clients', () => {
	beforeEach(() => {
		resetRestartTracker();
		vi.spyOn(authStore, 'getOperationsUrl').mockReturnValue('https://ins.example.com:9925/');
		vi.spyOn(authStore, 'checkForFabricConnect').mockReturnValue(false);
		vi.spyOn(authStore, 'checkForBasicAuth').mockReturnValue(undefined);
	});
	afterEach(() => {
		resetRestartTracker();
		vi.restoreAllMocks();
	});

	it('holds a request while the entity is down and sends it once released', async () => {
		vi.spyOn(authStore, 'getOperationToken').mockReturnValue(undefined);
		const { client, sent } = clientWithAdapter();
		const release = markRestarting([INSTANCE_ID], { reach: 'down', ttlMs: 60_000 });

		const request = client.post('/', { operation: 'get_status' });
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(sent).toHaveLength(0);

		release();
		await expect(request).resolves.toMatchObject({ status: 200 });
		expect(sent).toHaveLength(1);
	});

	it('lets requests through to a cluster that is only rolling', async () => {
		vi.spyOn(authStore, 'getOperationToken').mockReturnValue(undefined);
		const { client, sent } = clientWithAdapter();
		markRestarting([INSTANCE_ID], { reach: 'rolling', ttlMs: 60_000 });

		await client.post('/', { operation: 'get_status' });
		expect(sent).toHaveLength(1);
	});

	it('holds a proxied client through a rolling container restart, which CM refuses outright', async () => {
		vi.spyOn(authStore, 'getOperationToken').mockReturnValue(undefined);
		vi.spyOn(authStore, 'checkForFabricConnect').mockReturnValue(true);
		const { client, sent } = clientWithAdapter({ id: CLUSTER_ID });
		const rolling = {
			id: CLUSTER_ID,
			status: 'RESTARTING',
			instances: [{ id: 'ins-a', status: 'RUNNING' }, { id: 'ins-b', status: 'RESTARTING' }],
		};
		syncRestartsFromCluster(rolling);

		const request = client.post('/', { operation: 'get_status' });
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(sent).toHaveLength(0);

		syncRestartsFromCluster({ ...rolling, status: 'RUNNING', instances: [] });
		await request;
		expect(sent).toHaveLength(1);
	});

	it('lets a direct client through the same rolling container restart', async () => {
		vi.spyOn(authStore, 'getOperationToken').mockReturnValue(undefined);
		const { client, sent } = clientWithAdapter({ id: CLUSTER_ID });
		syncRestartsFromCluster({
			id: CLUSTER_ID,
			status: 'RESTARTING',
			instances: [{ id: 'ins-a', status: 'RUNNING' }, { id: 'ins-b', status: 'RESTARTING' }],
		});

		await client.post('/', { operation: 'get_status' });
		expect(sent).toHaveLength(1);
	});

	it('refuses a write to an entity that is down at once, rather than replaying it later', async () => {
		vi.spyOn(authStore, 'getOperationToken').mockReturnValue(undefined);
		const { client, sent } = clientWithAdapter();
		markRestarting([INSTANCE_ID], { reach: 'down', ttlMs: 60_000 });

		const write = client.post('/', { operation: 'insert', table: 'dog', records: [] });
		await expect(write).rejects.toMatchObject({
			code: RESTARTING_ERROR_CODE,
			message: expect.stringContaining('This instance is restarting'),
		});
		expect(sent).toHaveLength(0);
	});

	it("refuses token minting at once, so a route guard's Fabric Connect attempt is not stalled", async () => {
		vi.spyOn(authStore, 'getOperationToken').mockReturnValue(undefined);
		const { client, sent } = clientWithAdapter();
		markRestarting([INSTANCE_ID], { reach: 'down', ttlMs: 60_000 });

		await expect(client.post('/', { operation: 'create_authentication_tokens' })).rejects.toMatchObject({
			code: RESTARTING_ERROR_CODE,
		});
		expect(sent).toHaveLength(0);
	});

	it('still recognizes a read whose body axios already serialized, as a gateway retry re-sends it', async () => {
		vi.spyOn(authStore, 'getOperationToken').mockReturnValue(undefined);
		const { client, sent } = clientWithAdapter();
		const release = markRestarting([INSTANCE_ID], { reach: 'down', ttlMs: 60_000 });

		const retried = client.post('/', JSON.stringify({ operation: 'get_status' }));
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(sent).toHaveLength(0);
		release();
		await expect(retried).resolves.toMatchObject({ status: 200 });
		expect(sent).toHaveLength(1);
	});

	it('never holds the restart’s own requests', async () => {
		vi.spyOn(authStore, 'getOperationToken').mockReturnValue(undefined);
		const { client, sent } = clientWithAdapter();
		markRestarting([INSTANCE_ID], { reach: 'down', ttlMs: 60_000 });

		await client.post('/', { operation: 'user_info' }, { skipRestartGate: true });
		expect(sent).toHaveLength(1);
	});

	it('only holds requests for the entity that is restarting', async () => {
		vi.spyOn(authStore, 'getOperationToken').mockReturnValue(undefined);
		const { client, sent } = clientWithAdapter();
		markRestarting(['ins-other'], { reach: 'down', ttlMs: 60_000 });

		await client.post('/', { operation: 'get_status' });
		expect(sent).toHaveLength(1);
	});

	it('stamps the direct-connect Bearer when the held request is sent, not when it was queued', async () => {
		const token = vi.spyOn(authStore, 'getOperationToken').mockReturnValue('jwt-old');
		vi.spyOn(authStore, 'getConnectionGeneration').mockReturnValue(1);
		const { client, sent } = clientWithAdapter();
		const release = markRestarting([INSTANCE_ID], { reach: 'down', ttlMs: 60_000 });

		const request = client.post('/', { operation: 'get_status' });
		await new Promise((resolve) => setTimeout(resolve, 20));
		// The token rotates while the request waits out the restart.
		token.mockReturnValue('jwt-new');
		release();
		await request;
		expect(sent[0].headers.Authorization).toBe('Bearer jwt-new');
	});
});

describe('isConnectivityFailure', () => {
	it.each([
		['a network error', new AxiosError('Network Error', 'ERR_NETWORK')],
		['a timeout', new AxiosError('timeout', 'ECONNABORTED')],
		['a gateway error', Object.assign(new AxiosError('Bad Gateway'), { response: { status: 502 } })],
		['a write the gate refused', new AxiosError('This instance is restarting.', RESTARTING_ERROR_CODE)],
	])('is true for %s', (_name, err) => {
		expect(isConnectivityFailure(err)).toBe(true);
	});

	it.each([
		[
			'the proxy relaying a refused connection',
			Object.assign(new AxiosError('Server Error'), {
				response: { status: 500, data: { error: 'connect ECONNREFUSED 127.0.0.1:9925' } },
			}),
		],
		[
			'the proxy refusing a cluster mid container op',
			Object.assign(new AxiosError('Bad Request'), {
				response: { status: 400, data: { error: 'Cluster is not active' } },
			}),
		],
		[
			'the proxy refusing an instance mid container op',
			Object.assign(new AxiosError('Bad Request'), { response: { status: 400, data: 'Instance is not active' } }),
		],
	])('is true for %s', (_name, err) => {
		expect(isConnectivityFailure(err)).toBe(true);
	});

	it.each([
		['a 403', Object.assign(new AxiosError('Forbidden'), { response: { status: 403 } })],
		['a 500', Object.assign(new AxiosError('Server Error'), { response: { status: 500 } })],
		[
			'a 500 from Harper itself',
			Object.assign(new AxiosError('Server Error'), { response: { status: 500, data: { error: 'Table not found' } } }),
		],
		[
			'a validation 400',
			Object.assign(new AxiosError('Bad Request'), {
				response: { status: 400, data: { error: "'table' is required" } },
			}),
		],
		['a plain Error', new Error('boom')],
	])('is false for %s — a real answer', (_name, err) => {
		expect(isConnectivityFailure(err)).toBe(false);
	});
});

describe('isRestartNoise', () => {
	beforeEach(() => resetRestartTracker());
	afterEach(() => resetRestartTracker());

	const networkError = new AxiosError('Network Error', 'ERR_NETWORK');

	it('matches entity-first and operation-first keys of a restarting entity', () => {
		markRestarting([INSTANCE_ID], { reach: 'rolling', ttlMs: 60_000 });
		expect(isRestartNoise(networkError, [INSTANCE_ID, 'databases'])).toBe(true);
		expect(isRestartNoise(networkError, ['get_status', INSTANCE_ID])).toBe(true);
	});

	it('does not match another entity, or a failure that is a real answer', () => {
		markRestarting([INSTANCE_ID], { reach: 'down', ttlMs: 60_000 });
		expect(isRestartNoise(networkError, ['ins-other', 'databases'])).toBe(false);
		expect(
			isRestartNoise(Object.assign(new AxiosError('Forbidden'), { response: { status: 403 } }), [INSTANCE_ID]),
		).toBe(false);
	});
});
