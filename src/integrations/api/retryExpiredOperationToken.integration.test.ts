/** @vitest-environment jsdom */
import { getInstanceClient } from '@/config/getInstanceClient';
import { authStore } from '@/features/auth/store/authStore';
import { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';

const INSTANCE_ID = 'ins-123';
const DIRECT_URL = 'https://my-instance.example.com:9925/';
const STALE = 'stale-token';
const FRESH = 'fresh-token';

/** Axios only applies `validateStatus` inside its own adapters, so a custom one must reject. */
function instanceAcceptingOnly(token: string, seen: string[]) {
	return async (config: InternalAxiosRequestConfig) => {
		const authorization = String(config.headers.Authorization ?? '');
		seen.push(authorization);
		if (authorization === `Bearer ${token}`) {
			return { status: 200, statusText: 'OK', data: { ok: true }, headers: {}, config };
		}
		const response = { status: 401, statusText: 'Unauthorized', data: {}, headers: {}, config };
		throw new AxiosError('Unauthorized', AxiosError.ERR_BAD_REQUEST, config, undefined, response);
	};
}

function directConnectHolding(operationToken: string, recovered: string) {
	vi.spyOn(authStore, 'getOperationToken').mockReturnValue(operationToken);
	vi.spyOn(authStore, 'checkForFabricConnect').mockReturnValue(true);
	vi.spyOn(authStore, 'checkForBasicAuth').mockReturnValue(undefined);
	vi.spyOn(authStore, 'getOperationsUrl').mockReturnValue(DIRECT_URL);
	const recover = vi.spyOn(authStore, 'recoverExpiredOperationToken').mockImplementation(async () => {
		vi.spyOn(authStore, 'getOperationToken').mockReturnValue(recovered);
		return recovered;
	});
	return recover;
}

function staleSends(seen: string[]) {
	return seen.filter((authorization) => authorization === `Bearer ${STALE}`).length;
}

describe('a direct-connect client that outlives its operation token', () => {
	afterEach(() => vi.restoreAllMocks());

	it('stops sending the expired Bearer once a refresh has recovered a fresh one', async () => {
		directConnectHolding(STALE, FRESH);
		const seen: string[] = [];
		const client = getInstanceClient({ id: INSTANCE_ID });
		client.defaults.adapter = instanceAcceptingOnly(FRESH, seen);

		await expect(client.post('/', {})).resolves.toMatchObject({ status: 200 });
		await expect(client.post('/', {})).resolves.toMatchObject({ status: 200 });
		await expect(client.post('/', {})).resolves.toMatchObject({ status: 200 });

		expect(staleSends(seen)).toBe(1);
	});

	it('pays the stale Bearer once per request in the first burst, then never again', async () => {
		directConnectHolding(STALE, FRESH);
		const seen: string[] = [];
		const client = getInstanceClient({ id: INSTANCE_ID });
		client.defaults.adapter = instanceAcceptingOnly(FRESH, seen);

		await Promise.all([client.post('/', {}), client.post('/', {}), client.post('/', {})]);
		expect(staleSends(seen)).toBe(3);

		await client.post('/', {});
		expect(staleSends(seen)).toBe(3);
	});

	it('fails the request outright when the mint lands after the store dropped the token', async () => {
		directConnectHolding(STALE, FRESH);
		vi.spyOn(authStore, 'recoverExpiredOperationToken').mockImplementation(async () => {
			vi.spyOn(authStore, 'getOperationToken').mockReturnValue(undefined);
			return FRESH;
		});
		const seen: string[] = [];
		const client = getInstanceClient({ id: INSTANCE_ID });
		client.defaults.adapter = instanceAcceptingOnly(FRESH, seen);

		await expect(client.post('/', {})).rejects.toMatchObject({ response: { status: 401 } });

		expect(client.defaults.headers.Authorization).toBe(`Bearer ${STALE}`);
	});
});
