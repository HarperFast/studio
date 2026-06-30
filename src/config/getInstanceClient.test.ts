/** @vitest-environment jsdom */
import { getInstanceClient } from '@/config/getInstanceClient';
import { authStore } from '@/features/auth/store/authStore';
import { afterEach, describe, expect, it, vi } from 'vitest';

const INSTANCE_ID = 'ins-123';
const DIRECT_URL = 'https://my-instance.example.com:9925/';

function stubAuthStore({
	operationToken,
	fabricConnect = false,
	basicAuth,
}: {
	operationToken?: string;
	fabricConnect?: boolean;
	basicAuth?: { username: string; password: string };
}) {
	vi.spyOn(authStore, 'getOperationToken').mockReturnValue(operationToken);
	vi.spyOn(authStore, 'checkForFabricConnect').mockReturnValue(fabricConnect);
	vi.spyOn(authStore, 'checkForBasicAuth').mockReturnValue(basicAuth);
	vi.spyOn(authStore, 'getOperationsUrl').mockReturnValue(DIRECT_URL);
}

function authHeader(client: ReturnType<typeof getInstanceClient>): unknown {
	return (client.defaults.headers as Record<string, unknown>).Authorization;
}

describe('getInstanceClient', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('connects directly with a Bearer token when a Fabric Connect JWT is held', () => {
		stubAuthStore({ operationToken: 'jwt-abc', fabricConnect: true });

		const client = getInstanceClient({ id: INSTANCE_ID });

		expect(authHeader(client)).toBe('Bearer jwt-abc');
		expect(client.defaults.baseURL).toBe(DIRECT_URL);
		expect(client.defaults.withCredentials).toBe(false);
		expect(client.defaults.auth).toBeUndefined();
	});

	it('routes through the proxy when flagged for Fabric Connect but holding no token', () => {
		stubAuthStore({ fabricConnect: true });

		const client = getInstanceClient({ id: INSTANCE_ID });

		expect(authHeader(client)).toBeUndefined();
		expect(client.defaults.baseURL).toContain(`/HDBInstance/${INSTANCE_ID}/operation`);
		expect(client.defaults.withCredentials).toBe(true);
	});

	it('ignores the token and uses the proxy when forceFabricConnect is set', () => {
		stubAuthStore({ operationToken: 'jwt-abc', fabricConnect: true });

		const client = getInstanceClient({ id: INSTANCE_ID, forceFabricConnect: true });

		expect(authHeader(client)).toBeUndefined();
		expect(client.defaults.baseURL).toContain(`/HDBInstance/${INSTANCE_ID}/operation`);
	});

	it('prefers basic auth over a stale Fabric Connect token', () => {
		const basicAuth = { username: 'admin', password: 'pw' };
		stubAuthStore({ operationToken: 'jwt-abc', basicAuth });

		const client = getInstanceClient({ id: INSTANCE_ID });

		expect(authHeader(client)).toBeUndefined();
		expect(client.defaults.auth).toEqual(basicAuth);
		expect(client.defaults.baseURL).toBe(DIRECT_URL);
		expect(client.defaults.withCredentials).toBe(false);
	});

	it('falls back to cookie-based direct connect with no token, flag, or basic auth', () => {
		stubAuthStore({});

		const client = getInstanceClient({ id: INSTANCE_ID });

		expect(authHeader(client)).toBeUndefined();
		expect(client.defaults.baseURL).toBe(DIRECT_URL);
		expect(client.defaults.withCredentials).toBe(true);
	});

	it('disableFabricConnect suppresses both the token and proxy routing', () => {
		stubAuthStore({ operationToken: 'jwt-abc', fabricConnect: true });

		const client = getInstanceClient({ id: INSTANCE_ID, disableFabricConnect: true });

		expect(authHeader(client)).toBeUndefined();
		expect(client.defaults.baseURL).toBe(DIRECT_URL);
		expect(client.defaults.withCredentials).toBe(true);
	});

	it('forceOperationToken sends the Bearer token even when a basic-auth entry exists', () => {
		stubAuthStore({ operationToken: 'jwt-abc', basicAuth: { username: 'admin', password: 'pw' } });

		const client = getInstanceClient({ id: INSTANCE_ID, operationsUrl: DIRECT_URL, forceOperationToken: true });

		expect(authHeader(client)).toBe('Bearer jwt-abc');
		expect(client.defaults.auth).toBeUndefined();
		expect(client.defaults.baseURL).toBe(DIRECT_URL);
	});

	it('routes a cluster id through the /Cluster proxy path under Fabric Connect', () => {
		stubAuthStore({ fabricConnect: true });

		const client = getInstanceClient({ id: 'clu-123' });

		expect(client.defaults.baseURL).toContain('/Cluster/clu-123/operation');
		expect(authHeader(client)).toBeUndefined();
	});
});
