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

		// A cluster sign-out, a failed sign-in check dropping the app marker, an explorer clear, a storage wipe.
		storageEventFromAnotherTab(MARKER, JSON.stringify({ OverallAppSignIn }));
		storageEventFromAnotherTab(MARKER, '{}');
		storageEventFromAnotherTab('Studio:ExplorerAuthEpoch', JSON.stringify({ '*': 1 }));
		storageEventFromAnotherTab(null, null);
		// Someone else's session, a sign-out that knew no user, and values no sign-out writes.
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
		const failure = new Error('explorer listener failed');
		const stop = authStore.onExplorerAuthInvalidated(OverallAppSignIn, () => {
			throw failure;
		});

		expect(() => authStore.signOutAllLocally()).toThrow(failure);
		stop();

		expect(announcedUser()).toBe('usr_a');
	});

	it('names the ended user from every local sign-out, and is not written by the sweep before `/Logout/`', async () => {
		signIn();
		await authStore.signOutFromPotentiallyAuthenticatedInstances();
		expect(localStorage.getItem(SIGNAL)).toBeNull();
		// `logoutOnSuccess`, after the sweep has already cleared the user.
		authStore.signOutAllLocally();
		expect(announcedUser()).toBe('usr_a');

		signIn();
		authStore.signOutAllLocally();
		const first = localStorage.getItem(SIGNAL);
		signIn();
		authStore.signOutAllLocally();
		expect(announcedUser()).toBe('usr_a');
		expect(localStorage.getItem(SIGNAL)).not.toBe(first);

		// A tab with no user to name: nothing for another tab to match.
		authStore.signOutAllLocally();
		expect(announcedUser()).toBeNull();
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
