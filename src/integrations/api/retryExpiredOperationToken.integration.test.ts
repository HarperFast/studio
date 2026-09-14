/** @vitest-environment jsdom */
import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createInstanceAuthenticationTokens = vi.fn();
const getInstanceUserInfo = vi.fn();
vi.mock('@/integrations/api/instance/auth/createInstanceAuthenticationTokens', async (importOriginal) => ({
	...(await importOriginal<object>()),
	createInstanceAuthenticationTokens: (...args: unknown[]) => createInstanceAuthenticationTokens(...args),
}));
vi.mock('@/integrations/api/instance/status/getInstanceUserInfo', () => ({
	getInstanceUserInfo: (...args: unknown[]) => getInstanceUserInfo(...args),
}));

const { authStore } = await import('@/features/auth/store/authStore');
const { getInstanceClient } = await import('@/config/getInstanceClient');

const ID = 'ins-123';
const OPERATIONS_URL = 'https://ins-123.example.com:9925/';

function bearer(config: InternalAxiosRequestConfig): string {
	return String(config.headers.Authorization ?? '');
}

/** Axios applies `validateStatus` inside its own adapters, so a custom one must reject non-2xx. */
function reject401(config: InternalAxiosRequestConfig): never {
	const response = { status: 401, statusText: 'Unauthorized', data: {}, headers: {}, config };
	throw new AxiosError('Unauthorized', AxiosError.ERR_BAD_REQUEST, config, undefined, response);
}

function ok(config: InternalAxiosRequestConfig, data: unknown = { ok: true }) {
	return { status: 200, statusText: 'OK', data, headers: {}, config };
}

let seen: string[] = [];

function record(config: InternalAxiosRequestConfig): string {
	const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
	const label = (body as { operation?: string } | undefined)?.operation ?? 'call';
	seen.push(`${label}:${bearer(config).replace('Bearer ', '')}`);
	return label;
}

async function connectDirectly(token = 'op-1') {
	createInstanceAuthenticationTokens.mockResolvedValue({ operationToken: token, refreshToken: 'rt-1' });
	getInstanceUserInfo.mockResolvedValue({ username: 'someone' });
	await authStore.establishFabricConnectAuth({ id: ID, operationsUrl: OPERATIONS_URL });
	expect(authStore.getOperationToken(ID)).toBe(token);
}

/** An instance that accepts only `accepted`, and answers a refresh exchange with `mintsTo`. */
function instance({ accepted, mintsTo }: { accepted: string; mintsTo?: string }) {
	return async (config: InternalAxiosRequestConfig) => {
		const operation = record(config);
		if (operation === 'refresh_operation_token') {
			return mintsTo ? ok(config, { operation_token: mintsTo }) : reject401(config);
		}
		return bearer(config) === `Bearer ${accepted}` ? ok(config) : reject401(config);
	};
}

/** One fake instance for every client, including the refresh client the store builds internally. */
function serve(adapter: ReturnType<typeof instance>) {
	axios.defaults.adapter = adapter;
}

function client() {
	return getInstanceClient({ id: ID, operationsUrl: OPERATIONS_URL });
}

describe('a direct-connect client whose operation token expires mid-session', () => {
	const originalAdapter = axios.defaults.adapter;

	beforeEach(() => {
		seen = [];
		vi.clearAllMocks();
		authStore.flagForFabricConnect(ID, false);
	});

	afterEach(() => {
		axios.defaults.adapter = originalAdapter;
	});

	it('stops sending the expired Bearer once a refresh has recovered a fresh one', async () => {
		await connectDirectly();
		serve(instance({ accepted: 'op-2', mintsTo: 'op-2' }));
		const browse = client();

		await expect(browse.post('/', {})).resolves.toMatchObject({ status: 200 });
		await expect(browse.post('/', {})).resolves.toMatchObject({ status: 200 });
		await expect(browse.post('/', {})).resolves.toMatchObject({ status: 200 });

		expect(seen.filter((entry) => entry === 'call:op-1')).toHaveLength(1);
		expect(seen).toContain('refresh_operation_token:rt-1');
	});

	it('advances every retained client for the entity, not just the one that refreshed', async () => {
		await connectDirectly();
		serve(instance({ accepted: 'op-2', mintsTo: 'op-2' }));
		const browse = client();
		const peer = client();

		await expect(browse.post('/', {})).resolves.toMatchObject({ status: 200 });
		seen = [];
		await expect(peer.post('/', {})).resolves.toMatchObject({ status: 200 });

		expect(seen).toEqual(['call:op-2']);
	});

	it('settles rather than deadlocking when the refresh token is rejected too', async () => {
		await connectDirectly();
		// No `mintsTo`: the refresh exchange 401s, exactly as an expired refresh token would.
		serve(instance({ accepted: 'nothing' }));
		const browse = client();
		createInstanceAuthenticationTokens.mockReset();
		createInstanceAuthenticationTokens.mockRejectedValue(new Error('proxy re-mint also rejected'));

		const settled = await Promise.race([
			browse.post('/', {}).then(() => 'resolved', () => 'rejected'),
			new Promise((resolve) => setTimeout(() => resolve('HUNG'), 3000)),
		]);

		expect(settled).toBe('rejected');
		// The proxy re-mint fallback is reachable only because the refresh call never re-entered recovery.
		expect(createInstanceAuthenticationTokens).toHaveBeenCalledTimes(1);
	}, 10_000);

	it('cancels a retry of a request composed under a connection that has since been replaced', async () => {
		await connectDirectly();
		serve(instance({ accepted: 'op-other' }));
		const browse = client();
		// `curryRetryGatewayErrors` re-sends `error.config` after a backoff of up to 20s — long enough
		// for the user to have reconnected as someone else.
		const composed = await browse.post('/', {}).then(() => undefined, (error: AxiosError) => error.config);
		expect(composed).toBeDefined();
		authStore.flagForFabricConnect(ID, false);
		await connectDirectly('op-other');
		seen = [];

		await expect(browse.request(composed!)).rejects.toMatchObject({ code: AxiosError.ERR_CANCELED });

		expect(seen).toEqual([]);
	});

	it('does not make a new connection wait on the replaced connection\u2019s hung refresh', async () => {
		await connectDirectly();
		let hangFirstRefresh: () => void = () => {};
		const stalled = new Promise<void>((resolve) => {
			hangFirstRefresh = resolve;
		});
		let refreshes = 0;
		serve(async (config) => {
			const operation = record(config);
			if (operation === 'refresh_operation_token') {
				if (refreshes++ === 0) {
					await stalled;
					return reject401(config);
				}
				return ok(config, { operation_token: 'op-final' });
			}
			return bearer(config) === 'Bearer op-final' ? ok(config) : reject401(config);
		});
		createInstanceAuthenticationTokens.mockRejectedValue(new Error('proxy re-mint unavailable'));

		const stranded = client().post('/', {}).then(() => 'resolved', () => 'rejected');
		await vi.waitFor(() => expect(refreshes).toBe(1));
		authStore.flagForFabricConnect(ID, false);
		await connectDirectly('op-other');

		const reconnected = await Promise.race([
			client().post('/', {}).then(() => 'resolved', () => 'rejected'),
			new Promise((resolve) => setTimeout(() => resolve('HUNG'), 3000)),
		]);

		expect(reconnected).toBe('resolved');
		hangFirstRefresh();
		await expect(stranded).resolves.toBe('rejected');
	}, 10_000);

	it('sends no Bearer at all from a retained client once the store has signed out', async () => {
		await connectDirectly();
		serve(async (config) => {
			record(config);
			return ok(config);
		});
		const retained = client();
		await retained.post('/', {});
		seen = [];
		authStore.flagForFabricConnect(ID, false);

		await retained.post('/', {});

		expect(seen).toEqual(['call:']);
	});

	it('does not let a superseded refresh evict the live one, spawning a duplicate mint', async () => {
		await connectDirectly();
		const gates: Array<() => void> = [];
		let refreshes = 0;
		serve(async (config) => {
			const operation = record(config);
			if (operation === 'refresh_operation_token') {
				refreshes++;
				await new Promise<void>((resolve) => gates.push(resolve));
				return reject401(config);
			}
			return reject401(config);
		});
		createInstanceAuthenticationTokens.mockRejectedValue(new Error('proxy re-mint unavailable'));

		const stranded = client().post('/', {}).then(() => 'resolved', () => 'rejected');
		await vi.waitFor(() => expect(refreshes).toBe(1));
		authStore.flagForFabricConnect(ID, false);
		await connectDirectly('op-2');
		const live = client().post('/', {}).then(() => 'resolved', () => 'rejected');
		await vi.waitFor(() => expect(refreshes).toBe(2));

		// The superseded refresh settles while the live one is still in flight.
		gates[0]();
		await expect(stranded).resolves.toBe('rejected');
		const joined = client().post('/', {}).then(() => 'resolved', () => 'rejected');

		// A third exchange here would mean the live refresh was evicted and this request started its own.
		await vi.waitFor(() => expect(gates).toHaveLength(2));
		expect(refreshes).toBe(2);
		gates[1]();
		await expect(Promise.all([live, joined])).resolves.toEqual(['rejected', 'rejected']);
	}, 10_000);

	it('still presents the operation token on the sign-out logout, which posts after the store is cleared', async () => {
		await connectDirectly();
		serve(async (config) => {
			record(config);
			return ok(config, { message: 'logged out' });
		});

		await authStore.signOutFromPotentiallyAuthenticatedInstances();

		expect(seen).toContain('logout:op-1');
	});

	it('discards a refresh that succeeds after the connection it was minted for was replaced', async () => {
		await connectDirectly();
		let replaced = false;
		serve(async (config) => {
			const operation = record(config);
			if (operation === 'refresh_operation_token') {
				if (!replaced) {
					replaced = true;
					authStore.flagForFabricConnect(ID, false);
					await connectDirectly('op-other');
				}
				return ok(config, { operation_token: 'op-stale' });
			}
			return reject401(config);
		});

		await expect(client().post('/', {})).rejects.toMatchObject({ response: { status: 401 } });

		expect(authStore.getOperationToken(ID)).toBe('op-other');
	});

	it('does not replay a request whose connection was replaced mid-flight', async () => {
		await connectDirectly();
		serve(async (config) => {
			record(config);
			// The user disconnects and reconnects as someone else while this request is in flight.
			authStore.flagForFabricConnect(ID, false);
			await connectDirectly('op-other');
			return reject401(config);
		});

		await expect(client().post('/', {})).rejects.toMatchObject({ response: { status: 401 } });

		expect(seen).toEqual(['call:op-1']);
		expect(authStore.getOperationToken(ID)).toBe('op-other');
	});
});
