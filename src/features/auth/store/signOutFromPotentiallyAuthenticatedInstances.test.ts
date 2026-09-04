/** @vitest-environment jsdom */
import { apiClient } from '@/config/apiClient';
import { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it, MockInstance, vi } from 'vitest';
import { authStore, OverallAppSignIn } from './authStore';

const { onInstanceLogoutSubmit, createInstanceAuthenticationTokens, getInstanceUserInfo } = vi.hoisted(() => ({
	onInstanceLogoutSubmit: vi.fn(),
	createInstanceAuthenticationTokens: vi.fn(),
	getInstanceUserInfo: vi.fn(),
}));

vi.mock('@/integrations/api/instance/auth/onInstanceLogoutSubmit', () => ({ onInstanceLogoutSubmit }));
vi.mock('@/integrations/api/instance/auth/createInstanceAuthenticationTokens', () => ({
	createInstanceAuthenticationTokens,
	refreshInstanceOperationToken: vi.fn(),
}));
vi.mock('@/integrations/api/instance/status/getInstanceUserInfo', () => ({ getInstanceUserInfo }));

type SetArgs = Parameters<typeof authStore.setUserForIdAndKey>;

let consoleError: MockInstance<Console['error']>;
let consoleDebug: MockInstance<Console['debug']>;

function signInToInstance(id: string) {
	authStore.setUserForIdAndKey(id as SetArgs[0], `https://${id}` as SetArgs[1], { username: 'u' } as SetArgs[2]);
}

function loggedOutTargets() {
	return onInstanceLogoutSubmit.mock.calls.map(([{ entityId, instanceClient }]) => [
		entityId,
		instanceClient.defaults.baseURL,
	]);
}

function userOf(id: string) {
	return authStore.getConnectionById(id as SetArgs[0]).user;
}

beforeEach(() => {
	localStorage.clear();
	sessionStorage.clear();
	onInstanceLogoutSubmit.mockReset();
	// console.error calls through so the global render-phase tripwire still sees it.
	consoleError = vi.spyOn(console, 'error');
	consoleDebug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
});

afterEach(() => {
	consoleError.mockRestore();
	consoleDebug.mockRestore();
});

describe('authStore.signOutFromPotentiallyAuthenticatedInstances', () => {
	it('posts each logout to the instance it was signed into, with a short timeout', async () => {
		signInToInstance('ins-a');
		signInToInstance('ins-b');
		onInstanceLogoutSubmit.mockResolvedValue({ message: 'ok' });

		await authStore.signOutFromPotentiallyAuthenticatedInstances();

		expect(loggedOutTargets()).toEqual([['ins-a', 'https://ins-a'], ['ins-b', 'https://ins-b']]);
		expect(onInstanceLogoutSubmit.mock.calls.map(([{ instanceClient }]) => instanceClient.defaults.timeout)).toEqual([
			10_000,
			10_000,
		]);
	});

	it('does not retry a gateway error from the best-effort logout', async () => {
		signInToInstance('ins-gateway');
		onInstanceLogoutSubmit.mockResolvedValue({ message: 'ok' });
		await authStore.signOutFromPotentiallyAuthenticatedInstances();
		const [{ instanceClient }] = onInstanceLogoutSubmit.mock.calls[0];
		// Rejects the way axios's own adapters do for a non-2xx status.
		instanceClient.defaults.adapter = (config: InternalAxiosRequestConfig) => {
			const response = { status: 503, statusText: 'Service Unavailable', data: '', headers: {}, config };
			return Promise.reject(
				new AxiosError('Request failed with status code 503', AxiosError.ERR_BAD_RESPONSE, config, undefined, response),
			);
		};

		// getInstanceClient's gateway-retry interceptor would sleep 5s before the first retry.
		await expect(instanceClient.post('/', { operation: 'logout' })).rejects.toMatchObject({
			response: { status: 503 },
		});
	}, 2_000);

	it('keeps the direct operations URL and Bearer token for a Fabric Connect direct entity', async () => {
		const directUrl = 'https://ins-direct.example.com:9925/';
		createInstanceAuthenticationTokens.mockResolvedValue({ operationToken: 'jwt-token', refreshToken: 'refresh' });
		getInstanceUserInfo.mockResolvedValue({ username: 'u' });
		await authStore.establishFabricConnectAuth({ id: 'ins-direct', operationsUrl: directUrl });
		expect(authStore.getOperationToken('ins-direct')).toBe('jwt-token');
		onInstanceLogoutSubmit.mockResolvedValue({ message: 'ok' });

		await authStore.signOutFromPotentiallyAuthenticatedInstances();

		expect(loggedOutTargets()).toEqual([['ins-direct', directUrl]]);
		expect(onInstanceLogoutSubmit.mock.calls[0][0].instanceClient.defaults.headers.Authorization).toBe(
			'Bearer jwt-token',
		);
		expect(authStore.getOperationToken('ins-direct')).toBeUndefined();
	});

	it('routes a Fabric Connect proxy entity through the central-manager proxy', async () => {
		authStore.flagForFabricConnect('ins-proxy', true);
		signInToInstance('ins-proxy');
		onInstanceLogoutSubmit.mockResolvedValue({ message: 'ok' });

		await authStore.signOutFromPotentiallyAuthenticatedInstances();

		expect(loggedOutTargets()).toEqual([[
			'ins-proxy',
			`${apiClient.defaults.baseURL}/HDBInstance/ins-proxy/operation`,
		]]);
		expect(authStore.checkForFabricConnect('ins-proxy')).toBe(false);
	});

	it('clears every entity locally up front, then waits for every logout', async () => {
		signInToInstance('ins-slow-1');
		signInToInstance('ins-slow-2');
		const finish: Record<string, () => void> = {};
		onInstanceLogoutSubmit.mockImplementation(({ entityId }: { entityId: string }) =>
			new Promise<{ message: string }>((resolve) => {
				finish[entityId] = () => resolve({ message: 'ok' });
			})
		);
		const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

		let settled = false;
		const sweep = authStore.signOutFromPotentiallyAuthenticatedInstances().then(() => {
			settled = true;
		});

		expect(userOf('ins-slow-1')).toBeNull();
		expect(userOf('ins-slow-2')).toBeNull();
		expect(loggedOutTargets().map(([entityId]) => entityId)).toEqual(['ins-slow-1', 'ins-slow-2']);
		await flush();
		expect(settled).toBe(false);
		finish['ins-slow-1']();
		await flush();
		expect(settled).toBe(false);
		finish['ins-slow-2']();
		await sweep;
		expect(settled).toBe(true);
	});

	it('carries on past a failed instance logout without reporting it through console.error', async () => {
		signInToInstance('ins-down');
		signInToInstance('ins-up');
		authStore.flagForBasicAuth('ins-down', { username: 'u', password: 'p' });
		const failure = new Error('Request failed with status code 500');
		onInstanceLogoutSubmit.mockImplementation(({ entityId }: { entityId: string }) =>
			entityId === 'ins-down' ? Promise.reject(failure) : Promise.resolve({ message: 'ok' })
		);

		await authStore.signOutFromPotentiallyAuthenticatedInstances();

		expect(loggedOutTargets()).toEqual([['ins-down', 'https://ins-down'], ['ins-up', 'https://ins-up']]);
		expect(userOf('ins-down')).toBeNull();
		expect(userOf('ins-up')).toBeNull();
		expect(onInstanceLogoutSubmit.mock.calls[0][0].instanceClient.defaults.auth).toEqual({
			username: 'u',
			password: 'p',
		});
		// The stored credentials go too, even though the POST that normally clears them failed.
		expect(authStore.checkForBasicAuth('ins-down')).toBeUndefined();
		expect(consoleError).not.toHaveBeenCalled();
		expect(consoleDebug).toHaveBeenCalledWith(expect.stringContaining('ins-down'), failure.message);
	});

	it('carries on when the logout client cannot be built', async () => {
		signInToInstance('ins-corrupt');
		signInToInstance('ins-ok');
		// A stored basic-auth entry that is not base64 makes getInstanceClient throw synchronously.
		localStorage.setItem('Studio:BasicAuth:ins-corrupt', '%%%');
		onInstanceLogoutSubmit.mockResolvedValue({ message: 'ok' });

		await authStore.signOutFromPotentiallyAuthenticatedInstances();

		expect(loggedOutTargets()).toEqual([['ins-ok', 'https://ins-ok']]);
		expect(userOf('ins-corrupt')).toBeNull();
		expect(userOf('ins-ok')).toBeNull();
		expect(consoleError).not.toHaveBeenCalled();
		expect(consoleDebug).toHaveBeenCalledWith(expect.stringContaining('ins-corrupt'), expect.any(String));
	});

	it('does not post a logout for the cloud slot', async () => {
		authStore.setUserForIdAndKey(OverallAppSignIn, OverallAppSignIn, { id: 'usr_a' } as SetArgs[2]);

		await authStore.signOutFromPotentiallyAuthenticatedInstances();

		expect(onInstanceLogoutSubmit).not.toHaveBeenCalled();
		expect(authStore.getConnectionById(OverallAppSignIn).user).toBeNull();
	});
});
