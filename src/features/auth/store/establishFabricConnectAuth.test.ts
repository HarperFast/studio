/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getInstanceClient = vi.fn();
const createInstanceAuthenticationTokens = vi.fn();
const getInstanceUserInfo = vi.fn();

vi.mock('@/config/getInstanceClient', () => ({
	getInstanceClient: (...args: unknown[]) => getInstanceClient(...args),
}));
vi.mock('@/integrations/api/instance/auth/createInstanceAuthenticationTokens', () => ({
	createInstanceAuthenticationTokens: (...args: unknown[]) => createInstanceAuthenticationTokens(...args),
}));
vi.mock('@/integrations/api/instance/status/getInstanceUserInfo', () => ({
	getInstanceUserInfo: (...args: unknown[]) => getInstanceUserInfo(...args),
}));

const PROXY_URL = 'https://manager.example.com/HDBInstance/ins-1/operation';
const DIRECT_URL = 'https://instance.example.com:9925/';
const directUser = { username: 'direct-user' };
const proxyUser = { username: 'proxy-user' };

// Imported after the mocks are registered.
const { authStore } = await import('@/features/auth/store/authStore');

describe('authStore.establishFabricConnectAuth', () => {
	beforeEach(() => {
		// getInstanceClient is called with { forceFabricConnect: true } for the proxy client and with
		// an operationsUrl for the direct client. Hand back objects we can tell apart by baseURL.
		getInstanceClient.mockImplementation(({ forceFabricConnect }: { forceFabricConnect?: boolean }) => ({
			defaults: { baseURL: forceFabricConnect ? PROXY_URL : DIRECT_URL },
		}));
		createInstanceAuthenticationTokens.mockResolvedValue('jwt-token');
	});

	afterEach(() => {
		authStore.flagForFabricConnect('ins-1', false);
		localStorage.clear();
		vi.clearAllMocks();
	});

	it('connects directly with the JWT when the instance is reachable', async () => {
		getInstanceUserInfo.mockResolvedValue(directUser);

		const user = await authStore.establishFabricConnectAuth({ id: 'ins-1', operationsUrl: DIRECT_URL });

		expect(user).toBe(directUser);
		expect(authStore.getOperationToken('ins-1')).toBe('jwt-token');
		expect(authStore.hasResolvedFabricConnect('ins-1')).toBe(true);
		expect(authStore.checkForFabricConnect('ins-1')).toBe(true);
	});

	it('drops the JWT and falls back to the proxy when direct connect is unreachable', async () => {
		getInstanceUserInfo.mockImplementation((
			{ instanceClient }: { instanceClient: { defaults: { baseURL: string } } },
		) =>
			instanceClient.defaults.baseURL === DIRECT_URL
				? Promise.reject(new Error('CORS'))
				: Promise.resolve(proxyUser)
		);

		const user = await authStore.establishFabricConnectAuth({ id: 'ins-1', operationsUrl: DIRECT_URL });

		expect(user).toBe(proxyUser);
		// No token retained in proxy mode, but the connection is still resolved.
		expect(authStore.getOperationToken('ins-1')).toBeUndefined();
		expect(authStore.hasResolvedFabricConnect('ins-1')).toBe(true);
		expect(authStore.checkForFabricConnect('ins-1')).toBe(true);
	});

	it('shares one in-flight request for concurrent calls', async () => {
		getInstanceUserInfo.mockResolvedValue(directUser);

		const [a, b] = await Promise.all([
			authStore.establishFabricConnectAuth({ id: 'ins-1', operationsUrl: DIRECT_URL }),
			authStore.establishFabricConnectAuth({ id: 'ins-1', operationsUrl: DIRECT_URL }),
		]);

		expect(a).toBe(directUser);
		expect(b).toBe(directUser);
		expect(createInstanceAuthenticationTokens).toHaveBeenCalledTimes(1);
	});

	it('clears resolution and rethrows when no token can be obtained', async () => {
		createInstanceAuthenticationTokens.mockRejectedValue(new Error('proxy unauthorized'));

		await expect(authStore.establishFabricConnectAuth({ id: 'ins-1', operationsUrl: DIRECT_URL }))
			.rejects.toThrow('proxy unauthorized');
		expect(authStore.hasResolvedFabricConnect('ins-1')).toBe(false);
	});

	it('clears resolution and rethrows when both direct and proxy verification fail', async () => {
		// Token mints, but neither the direct probe nor the proxy fallback can reach the instance — the
		// half-resolved {mode:'proxy'} entry must be cleared so the next navigation retries.
		getInstanceUserInfo.mockRejectedValue(new Error('unreachable'));

		await expect(authStore.establishFabricConnectAuth({ id: 'ins-1', operationsUrl: DIRECT_URL }))
			.rejects.toThrow('unreachable');
		expect(authStore.hasResolvedFabricConnect('ins-1')).toBe(false);
		expect(authStore.getOperationToken('ins-1')).toBeUndefined();
	});

	it('skips the direct Bearer probe and uses the proxy when no direct operations URL is known', async () => {
		// Without a concrete direct URL, a Bearer request would be sent to the stored key (possibly the
		// proxy origin) — so it must go straight to proxy mode and never probe directly.
		getInstanceUserInfo.mockResolvedValue(proxyUser);

		const user = await authStore.establishFabricConnectAuth({ id: 'ins-1', operationsUrl: null });

		expect(user).toBe(proxyUser);
		expect(authStore.getOperationToken('ins-1')).toBeUndefined();
		expect(getInstanceUserInfo).toHaveBeenCalledTimes(1);
		expect(getInstanceUserInfo.mock.calls[0][0].instanceClient.defaults.baseURL).toBe(PROXY_URL);
	});

	it('drops the in-memory token when Fabric Connect is flagged off (e.g. on logout)', async () => {
		getInstanceUserInfo.mockResolvedValue(directUser);
		await authStore.establishFabricConnectAuth({ id: 'ins-1', operationsUrl: DIRECT_URL });
		expect(authStore.getOperationToken('ins-1')).toBe('jwt-token');

		authStore.flagForFabricConnect('ins-1', false);

		expect(authStore.getOperationToken('ins-1')).toBeUndefined();
		expect(authStore.hasResolvedFabricConnect('ins-1')).toBe(false);
	});
});
