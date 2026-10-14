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

import { apiClient } from '@/config/apiClient';
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

function signOutOf(user: unknown) {
	return JSON.stringify({ user, at: '1' });
}

function announcedUser() {
	const value = localStorage.getItem(SIGNAL);
	return value === null ? undefined : (JSON.parse(value) as { user: unknown }).user;
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
	it('fires for another tab’s sign-out of this tab’s user, and for nothing else it writes', () => {
		signIn();
		const signedOut = vi.fn();
		const stop = authStore.onAppSignedOutElsewhere(signedOut);

		storageEventFromAnotherTab(MARKER, JSON.stringify({ OverallAppSignIn }));
		storageEventFromAnotherTab(MARKER, '{}');
		storageEventFromAnotherTab('Studio:ExplorerAuthEpoch', JSON.stringify({ '*': 1 }));
		storageEventFromAnotherTab(null, null);
		storageEventFromAnotherTab(SIGNAL, signOutOf('usr_v'));
		storageEventFromAnotherTab(SIGNAL, signOutOf(null));
		storageEventFromAnotherTab(SIGNAL, '1');
		storageEventFromAnotherTab(SIGNAL, 'null');
		storageEventFromAnotherTab(SIGNAL, '{');
		expect(signedOut).not.toHaveBeenCalled();

		storageEventFromAnotherTab(SIGNAL, signOutOf('usr_a'));
		expect(signedOut).toHaveBeenCalledOnce();
		stop();
	});

	it.each([
		['no id', {}],
		['an id that is not a string', { id: 42 }],
		['an empty id', { id: '' }],
	])('treats a user with %s as no one to name or match', (_, user) => {
		authStore.setUserForIdAndKey(OverallAppSignIn, OverallAppSignIn, user as SetArgs[2]);
		const signedOut = vi.fn();
		const stop = authStore.onAppSignedOutElsewhere(signedOut);

		storageEventFromAnotherTab(SIGNAL, JSON.stringify({ at: '1' }));
		storageEventFromAnotherTab(SIGNAL, signOutOf(42));
		authStore.signOutAllLocally();

		expect(signedOut).not.toHaveBeenCalled();
		expect(localStorage.getItem(SIGNAL)).toBeNull();
		stop();
	});

	it('does nothing in a tab that holds no app sign-in', () => {
		const signedOut = vi.fn();
		const stop = authStore.onAppSignedOutElsewhere(signedOut);

		storageEventFromAnotherTab(SIGNAL, signOutOf('usr_a'));
		storageEventFromAnotherTab(SIGNAL, signOutOf(null));

		expect(signedOut).not.toHaveBeenCalled();
		stop();
	});

	it.each([
		['the user it named', 'usr_a', 2],
		['someone else', 'usr_v', 1],
	])('asks again when a check that was out during a sign-out of %s comes back as them', async (_, ended, checks) => {
		signIn();
		let answer: (response: { data: { id: string } }) => void = () => undefined;
		vi.mocked(apiClient.get)
			.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)))
			.mockReturnValue(new Promise(() => undefined));
		const check = authStore.reloadUser(OverallAppSignIn);
		const signedOut = vi.fn();
		const stop = authStore.onAppSignedOutElsewhere(signedOut);

		storageEventFromAnotherTab(SIGNAL, signOutOf(ended));
		answer({ data: { id: 'usr_a' } });
		await check;

		expect(signedOut).not.toHaveBeenCalled();
		expect(apiClient.get).toHaveBeenCalledTimes(checks);
		stop();
	});

	it('does not ask again on a later check in a tab that was signed out when it heard', async () => {
		const stop = authStore.onAppSignedOutElsewhere(vi.fn());
		storageEventFromAnotherTab(SIGNAL, signOutOf('usr_a'));
		signIn();
		vi.mocked(apiClient.get).mockResolvedValueOnce({ data: { id: 'usr_a' } }).mockReturnValue(
			new Promise(() => undefined),
		);

		await authStore.reloadUser(OverallAppSignIn);

		expect(apiClient.get).toHaveBeenCalledOnce();
		stop();
	});

	it('still names the ended user when the teardown throws', () => {
		signIn();
		const failure = new Error('teardown failed');
		const signOutLocally = vi.spyOn(authStore, 'signOutLocally').mockImplementation(() => {
			throw failure;
		});

		expect(() => authStore.signOutAllLocally()).toThrow(failure);
		signOutLocally.mockRestore();

		expect(announcedUser()).toBe('usr_a');
	});

	it('keeps a refused announcement for a later retry when storage refuses the first retry too', () => {
		signIn();
		let full = true;
		const setItem = Storage.prototype.setItem;
		const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function(this: Storage, key, value) {
			if (this === localStorage && full) {
				throw new DOMException('Storage is full.', 'QuotaExceededError');
			}
			setItem.call(this, key, value);
		});
		authStore.signOutAllLocally();
		authStore.retrySignOutWritesAfterWipe();
		full = false;

		authStore.retrySignOutWritesAfterWipe();

		const { calls, results } = write.mock;
		const accepted = calls.filter(([key], index) => key === SIGNAL && results[index]?.type === 'return');
		expect(accepted.map(([, value]) => (JSON.parse(value) as { user: unknown }).user)).toEqual(['usr_a']);
	});

	it('names the ended user from every local sign-out, and is not written by the sweep before `/Logout/`', async () => {
		signIn();
		await authStore.signOutFromPotentiallyAuthenticatedInstances();
		expect(localStorage.getItem(SIGNAL)).toBeNull();
		authStore.signOutAllLocally();
		expect(announcedUser()).toBe('usr_a');

		signIn();
		authStore.signOutAllLocally();
		const first = localStorage.getItem(SIGNAL);
		signIn();
		authStore.signOutAllLocally();
		expect(announcedUser()).toBe('usr_a');
		expect(localStorage.getItem(SIGNAL)).not.toBe(first);

		const last = localStorage.getItem(SIGNAL);
		authStore.signOutAllLocally();
		expect(localStorage.getItem(SIGNAL)).toBe(last);
	});

	it('names the user a check had blanked, and the latest one after a `/Logout/` that failed', async () => {
		signIn();
		await authStore.signOutFromPotentiallyAuthenticatedInstances();
		authStore.setUserForIdAndKey(OverallAppSignIn, OverallAppSignIn, { id: 'usr_v' } as SetArgs[2]);
		vi.mocked(apiClient.get).mockReturnValue(new Promise(() => undefined));
		void authStore.reloadUser(OverallAppSignIn);
		expect(authStore.getConnectionById(OverallAppSignIn).user).toBeNull();

		authStore.signOutAllLocally();

		expect(announcedUser()).toBe('usr_v');
	});
});

describe('authStore.forgetAppSignInEndedElsewhere', () => {
	it('leaves no user for a later sign-out of this tab to name again', () => {
		signIn();
		authStore.forgetAppSignInEndedElsewhere();

		authStore.signOutAllLocally();

		expect(localStorage.getItem(SIGNAL)).toBeNull();
	});

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
