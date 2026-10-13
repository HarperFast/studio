/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { createInstanceAuthenticationTokens, getInstanceUserInfo } = vi.hoisted(() => ({
	createInstanceAuthenticationTokens: vi.fn(),
	getInstanceUserInfo: vi.fn(),
}));
vi.mock('@/config/apiClient', () => ({ apiClient: { get: vi.fn(), defaults: { baseURL: 'https://cm.example.com' } } }));
vi.mock('@/integrations/api/instance/auth/createInstanceAuthenticationTokens', () => ({
	createInstanceAuthenticationTokens,
	refreshInstanceOperationToken: vi.fn(),
}));
vi.mock('@/integrations/api/instance/status/getInstanceUserInfo', () => ({ getInstanceUserInfo }));

import { authStore, OverallAppSignIn } from './authStore';

type SetArgs = Parameters<typeof authStore.setUserForIdAndKey>;

const MARKER = 'Studio:PotentiallyAuthenticated';
const SIGNAL = 'Studio:AppSignOut';
const DIRECT_URL = 'https://ins-direct.example.com:9925/';

function signIn() {
	authStore.setUserForIdAndKey(OverallAppSignIn, OverallAppSignIn, { id: 'usr_a' } as SetArgs[2]);
}

function storageEventFromAnotherTab(key: string | null, newValue: string | null) {
	window.dispatchEvent(new StorageEvent('storage', { key, newValue, storageArea: localStorage }));
}

beforeEach(() => {
	localStorage.clear();
	sessionStorage.clear();
	vi.spyOn(console, 'debug').mockImplementation(() => undefined);
});

afterEach(() => {
	authStore.signOutAllLocally();
	vi.resetAllMocks();
	vi.restoreAllMocks();
});

describe('authStore.onAppSignedOutElsewhere', () => {
	it('fires for another tab’s app sign-out, and for nothing else it writes', () => {
		signIn();
		const signedOut = vi.fn();
		const stop = authStore.onAppSignedOutElsewhere(signedOut);

		// A cluster sign-out, a failed sign-in check dropping the app marker, an explorer clear, a storage wipe.
		storageEventFromAnotherTab(MARKER, JSON.stringify({ OverallAppSignIn }));
		storageEventFromAnotherTab(MARKER, '{}');
		storageEventFromAnotherTab('Studio:ExplorerAuthEpoch', JSON.stringify({ '*': 1 }));
		storageEventFromAnotherTab(null, null);
		expect(signedOut).not.toHaveBeenCalled();

		storageEventFromAnotherTab(SIGNAL, '1');
		expect(signedOut).toHaveBeenCalledOnce();
		stop();
	});

	it('does nothing in a tab that holds no app sign-in', () => {
		const signedOut = vi.fn();
		const stop = authStore.onAppSignedOutElsewhere(signedOut);

		storageEventFromAnotherTab(SIGNAL, '1');

		expect(signedOut).not.toHaveBeenCalled();
		stop();
	});

	it('is announced by every local sign-out of an ended session, and not by the sweep before `/Logout/`', async () => {
		signIn();
		await authStore.signOutFromPotentiallyAuthenticatedInstances();
		expect(localStorage.getItem(SIGNAL)).toBeNull();

		const values = new Set<string | null>();
		for (let i = 0; i < 2; i++) {
			signIn();
			authStore.signOutAllLocally();
			values.add(localStorage.getItem(SIGNAL));
		}
		values.delete(null);
		expect(values.size).toBe(2);
	});
});

describe('authStore.forgetAppSignInEndedElsewhere', () => {
	it('signs every entity out in memory without writing the storage the tabs share', () => {
		signIn();
		authStore.setUserForIdAndKey('ins-a', 'https://ins-a.example.com', { username: 'u' } as SetArgs[2]);
		// What the other tab wrote after signing out: a sign-in, perhaps as someone else.
		localStorage.clear();
		localStorage.setItem(MARKER, JSON.stringify({ OverallAppSignIn }));
		const writes = [
			vi.spyOn(Storage.prototype, 'setItem'),
			vi.spyOn(Storage.prototype, 'removeItem'),
			vi.spyOn(Storage.prototype, 'clear'),
		];

		authStore.forgetAppSignInEndedElsewhere();

		expect(authStore.isKnownSignedOut(OverallAppSignIn)).toBe(true);
		expect(authStore.getConnectionById('ins-a').user).toBeNull();
		expect(authStore.getOperationsUrl('ins-a')).toBeUndefined();
		const localWrites = writes.flatMap((spy) => spy.mock.contexts).filter((storage) => storage === localStorage);
		expect(localWrites).toEqual([]);
		expect(localStorage.getItem(MARKER)).toBe(JSON.stringify({ OverallAppSignIn }));
	});

	it('drops a direct-connect token, and a sign-in check still in flight', async () => {
		signIn();
		createInstanceAuthenticationTokens.mockResolvedValue({ operationToken: 'jwt', refreshToken: 'refresh' });
		getInstanceUserInfo.mockResolvedValueOnce({ username: 'direct' });
		await authStore.establishFabricConnectAuth({ id: 'ins-direct', operationsUrl: DIRECT_URL });
		expect(authStore.getOperationToken('ins-direct')).toBe('jwt');
		let answerCheck: (user: { username: string }) => void = () => undefined;
		getInstanceUserInfo.mockReturnValueOnce(new Promise((resolve) => (answerCheck = resolve)));
		const check = authStore.reloadUser('ins-direct');

		authStore.forgetAppSignInEndedElsewhere();
		answerCheck({ username: 'direct' });

		await expect(check).resolves.toBeNull();
		expect(authStore.getOperationToken('ins-direct')).toBeUndefined();
		expect(authStore.getConnectionById('ins-direct').user).toBeNull();
	});
});
