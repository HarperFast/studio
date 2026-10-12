/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { get, onInstanceLogoutSubmit, createInstanceAuthenticationTokens, getInstanceUserInfo } = vi.hoisted(() => ({
	get: vi.fn(),
	onInstanceLogoutSubmit: vi.fn(),
	createInstanceAuthenticationTokens: vi.fn(),
	getInstanceUserInfo: vi.fn(),
}));
vi.mock('@/config/apiClient', () => ({ apiClient: { get, defaults: { baseURL: 'https://cm.example.com' } } }));
vi.mock('@/integrations/api/instance/auth/onInstanceLogoutSubmit', () => ({ onInstanceLogoutSubmit }));
vi.mock('@/integrations/api/instance/auth/createInstanceAuthenticationTokens', () => ({
	createInstanceAuthenticationTokens,
	refreshInstanceOperationToken: vi.fn(),
}));
vi.mock('@/integrations/api/instance/status/getInstanceUserInfo', () => ({ getInstanceUserInfo }));

import { getCurrentUser } from '@/features/auth/queries/getCurrentUser';
import { authStore, OverallAppSignIn } from './authStore';

type SetArgs = Parameters<typeof authStore.setUserForIdAndKey>;

const DIRECT_URL = 'https://ins-race.example.com:9925/';

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<T>((settle, fail) => {
		resolve = settle;
		reject = fail;
	});
	return { promise, resolve, reject };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function expectNothingRestored(id: string) {
	expect(authStore.getConnectionById(id).user).toBeNull();
	expect(authStore.getOperationsUrl(id)).toBeUndefined();
	expect(authStore.getOperationToken(id)).toBeUndefined();
	expect(authStore.hasResolvedFabricConnect(id)).toBe(false);
	expect(authStore.checkForFabricConnect(id)).toBe(false);
	expect(authStore.getLastConnectMode(id)).toBeUndefined();
}

beforeEach(() => {
	localStorage.clear();
	sessionStorage.clear();
	onInstanceLogoutSubmit.mockResolvedValue({ message: 'ok' });
	vi.spyOn(console, 'debug').mockImplementation(() => undefined);
});

afterEach(() => {
	authStore.signOutAllLocally();
	vi.resetAllMocks();
	vi.restoreAllMocks();
});

describe('auth resolutions that outlive a sign-out', () => {
	it('loadUser does not restore an entity the sweep signed out', async () => {
		authStore.setUserForIdAndKey('ins-load', 'https://ins-load', { username: 'prior' } as SetArgs[2]);
		const answer = deferred<{ username: string }>();
		getInstanceUserInfo.mockReturnValueOnce(answer.promise);
		vi.spyOn(console, 'error').mockImplementation(() => undefined);

		const reload = authStore.reloadUser('ins-load');
		await authStore.signOutFromPotentiallyAuthenticatedInstances();
		answer.resolve({ username: 'prior' });

		await expect(reload).resolves.toBeNull();
		expectNothingRestored('ins-load');
		expect(localStorage.getItem('Studio:PotentiallyAuthenticated') ?? '').not.toContain('ins-load');
	});

	it('getCurrentUser hands back its answer but does not sign the cloud slot back in', async () => {
		const answer = deferred<{ data: { id: string } }>();
		get.mockReturnValueOnce(answer.promise);

		const current = getCurrentUser();
		authStore.signOutAllLocally();
		answer.resolve({ data: { id: 'usr_prior' } });

		await expect(current).resolves.toEqual({ id: 'usr_prior' });
		expect(authStore.getConnectionById(OverallAppSignIn).user).toBeNull();
	});

	it('getCurrentUser still syncs the cloud slot when no sign-out intervened', async () => {
		get.mockResolvedValueOnce({ data: { id: 'usr_current' } });

		await getCurrentUser();

		expect(authStore.getConnectionById(OverallAppSignIn).user).toEqual({ id: 'usr_current' });
	});

	it('abandons a Fabric Connect establish whose token mint outlives the sweep', async () => {
		const mint = deferred<{ operationToken: string; refreshToken: string }>();
		createInstanceAuthenticationTokens.mockReturnValueOnce(mint.promise);

		const establish = authStore.establishFabricConnectAuth({ id: 'ins-race', operationsUrl: DIRECT_URL });
		await authStore.signOutFromPotentiallyAuthenticatedInstances();
		mint.resolve({ operationToken: 'prior-jwt', refreshToken: 'prior-refresh' });

		await expect(establish).rejects.toThrow('Signed out before Fabric Connect finished connecting.');
		expect(getInstanceUserInfo).not.toHaveBeenCalled();
		expectNothingRestored('ins-race');
	});

	it('abandons at the direct probe instead of falling back to the proxy', async () => {
		createInstanceAuthenticationTokens.mockResolvedValueOnce({ operationToken: 'prior-jwt', refreshToken: 'r' });
		const probe = deferred<{ username: string }>();
		getInstanceUserInfo.mockReturnValueOnce(probe.promise);

		const establish = authStore.establishFabricConnectAuth({ id: 'ins-race', operationsUrl: DIRECT_URL });
		await flush();
		expect(authStore.getOperationToken('ins-race')).toBe('prior-jwt');
		await authStore.signOutFromPotentiallyAuthenticatedInstances();
		probe.resolve({ username: 'prior' });

		await expect(establish).rejects.toThrow('Signed out before Fabric Connect finished connecting.');
		expect(getInstanceUserInfo).toHaveBeenCalledTimes(1);
		expectNothingRestored('ins-race');
	});

	it('abandons at the proxy probe when the entity is disconnected on its own', async () => {
		createInstanceAuthenticationTokens.mockResolvedValueOnce({ operationToken: 'prior-jwt', refreshToken: 'r' });
		const probe = deferred<{ username: string }>();
		getInstanceUserInfo.mockReturnValueOnce(probe.promise);

		const establish = authStore.establishFabricConnectAuth({ id: 'ins-race', operationsUrl: null });
		await flush();
		authStore.setUserForIdAndKey('ins-race', 'ins-race', null);
		probe.resolve({ username: 'prior' });

		await expect(establish).rejects.toThrow('Signed out before Fabric Connect finished connecting.');
		expectNothingRestored('ins-race');
	});

	it('leaves a connection started after the sign-out to finish undisturbed', async () => {
		const priorMint = deferred<{ operationToken: string; refreshToken: string }>();
		const nextMint = deferred<{ operationToken: string; refreshToken: string }>();
		const nextProbe = deferred<{ username: string }>();
		createInstanceAuthenticationTokens.mockReturnValueOnce(priorMint.promise).mockReturnValueOnce(nextMint.promise);
		getInstanceUserInfo.mockReturnValueOnce(nextProbe.promise);

		const prior = authStore.establishFabricConnectAuth({ id: 'ins-race', operationsUrl: DIRECT_URL });
		authStore.signOutAllLocally();
		const next = authStore.establishFabricConnectAuth({ id: 'ins-race', operationsUrl: DIRECT_URL });
		nextMint.resolve({ operationToken: 'next-jwt', refreshToken: 'next-refresh' });
		await flush();
		priorMint.resolve({ operationToken: 'prior-jwt', refreshToken: 'prior-refresh' });
		await expect(prior).rejects.toThrow('Signed out before Fabric Connect finished connecting.');

		expect(authStore.getOperationToken('ins-race')).toBe('next-jwt');
		// The settled prior attempt must not evict the live one, or this would start a third mint.
		const joined = authStore.establishFabricConnectAuth({ id: 'ins-race', operationsUrl: DIRECT_URL });
		expect(createInstanceAuthenticationTokens).toHaveBeenCalledTimes(2);
		nextProbe.resolve({ username: 'next' });
		await expect(next).resolves.toEqual({ username: 'next' });
		await expect(joined).resolves.toEqual({ username: 'next' });
		expect(authStore.getConnectionById('ins-race').user).toEqual({ username: 'next' });
	});

	it('starts a fresh connect after a per-entity disconnect instead of joining the abandoned one', async () => {
		const priorMint = deferred<{ operationToken: string; refreshToken: string }>();
		createInstanceAuthenticationTokens.mockReturnValueOnce(priorMint.promise).mockResolvedValueOnce({
			operationToken: 'next-jwt',
			refreshToken: 'next-refresh',
		});
		getInstanceUserInfo.mockResolvedValueOnce({ username: 'next' });

		const prior = authStore.establishFabricConnectAuth({ id: 'ins-race', operationsUrl: DIRECT_URL });
		authStore.setUserForIdAndKey('ins-race', 'ins-race', null);
		const next = authStore.establishFabricConnectAuth({ id: 'ins-race', operationsUrl: DIRECT_URL });
		priorMint.resolve({ operationToken: 'prior-jwt', refreshToken: 'prior-refresh' });

		await expect(prior).rejects.toThrow('Signed out before Fabric Connect finished connecting.');
		await expect(next).resolves.toEqual({ username: 'next' });
		expect(authStore.getOperationToken('ins-race')).toBe('next-jwt');
	});

	it('does not clear the newer connection when the abandoned mint fails instead', async () => {
		const priorMint = deferred<never>();
		createInstanceAuthenticationTokens.mockReturnValueOnce(priorMint.promise).mockResolvedValueOnce({
			operationToken: 'next-jwt',
			refreshToken: 'next-refresh',
		});
		getInstanceUserInfo.mockReturnValueOnce(new Promise(() => undefined));

		const prior = authStore.establishFabricConnectAuth({ id: 'ins-race', operationsUrl: DIRECT_URL });
		authStore.signOutAllLocally();
		void authStore.establishFabricConnectAuth({ id: 'ins-race', operationsUrl: DIRECT_URL });
		await flush();
		priorMint.reject(new Error('Request failed with status code 401'));

		await expect(prior).rejects.toThrow('401');
		expect(authStore.getOperationToken('ins-race')).toBe('next-jwt');
	});

	it('drops a first connect the sweep never visits before it waits on any logout', async () => {
		authStore.setUserForIdAndKey('ins-marked', 'https://ins-marked', { username: 'prior' } as SetArgs[2]);
		const logout = deferred<{ message: string }>();
		onInstanceLogoutSubmit.mockReturnValueOnce(logout.promise);
		createInstanceAuthenticationTokens.mockResolvedValueOnce({ operationToken: 'prior-jwt', refreshToken: 'r' });
		const probe = deferred<{ username: string }>();
		getInstanceUserInfo.mockReturnValueOnce(probe.promise);

		const prior = authStore.establishFabricConnectAuth({ id: 'ins-race', operationsUrl: DIRECT_URL });
		await flush();
		expect(authStore.getOperationToken('ins-race')).toBe('prior-jwt');
		const sweep = authStore.signOutFromPotentiallyAuthenticatedInstances();

		expect(authStore.getOperationToken('ins-race')).toBeUndefined();
		expect(authStore.hasResolvedFabricConnect('ins-race')).toBe(false);

		createInstanceAuthenticationTokens.mockResolvedValueOnce({ operationToken: 'next-jwt', refreshToken: 'r2' });
		getInstanceUserInfo.mockResolvedValueOnce({ username: 'next' });
		await expect(authStore.establishFabricConnectAuth({ id: 'ins-race', operationsUrl: DIRECT_URL })).resolves
			.toEqual({ username: 'next' });

		probe.resolve({ username: 'prior' });
		logout.resolve({ message: 'ok' });
		await sweep;
		await expect(prior).rejects.toThrow('Signed out before Fabric Connect finished connecting.');
		expect(authStore.getOperationToken('ins-race')).toBe('next-jwt');
	});
});
