/** @vitest-environment jsdom */
import { authStore, OverallAppSignIn } from '@/features/auth/store/authStore';
import { queryClient } from '@/react-query/queryClient';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearAuthStateLocally } from './clearAuthStateLocally';
import { logoutOnSuccess } from './logoutOnSuccess';

type SetArgs = Parameters<typeof authStore.setUserForIdAndKey>;

function seedSignedInTab() {
	authStore.setUserForIdAndKey(OverallAppSignIn, OverallAppSignIn, { id: 'usr_a' } as SetArgs[2]);
	authStore.setUserForIdAndKey('ins-a', 'https://ins-a', { username: 'u' } as SetArgs[2]);
	authStore.flagForBasicAuth('ins-a', { username: 'u', password: 'p' });
	sessionStorage.setItem('ApiExplorerSettings', JSON.stringify({ 'ins-a': { auth: { type: 'bearer', token: 't' } } }));
	queryClient.setQueryData(['previous-user-data'], { secret: true });
	queryClient.getMutationCache().build(queryClient, { mutationKey: ['previous-user-mutation'] });
}

function expectCachesEmpty() {
	expect(queryClient.getQueryCache().getAll()).toEqual([]);
	expect(queryClient.getMutationCache().getAll()).toEqual([]);
}

function failWith(name: string) {
	return () => {
		throw new DOMException('Storage refused.', name);
	};
}

beforeEach(() => {
	localStorage.clear();
	sessionStorage.clear();
	queryClient.clear();
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe.each(
	[
		['clearAuthStateLocally', clearAuthStateLocally],
		['logoutOnSuccess', logoutOnSuccess],
	] as const,
)('%s', (_name, signOut) => {
	it('signs every entity out and wipes both caches and both stores', async () => {
		seedSignedInTab();

		await signOut();

		expect(authStore.getConnectionById(OverallAppSignIn).user).toBeNull();
		expect(authStore.getConnectionById('ins-a').user).toBeNull();
		expectCachesEmpty();
		expect(localStorage.length).toBe(0);
		expect(sessionStorage.length).toBe(0);
	});

	it('still wipes everything when every storage write throws', async () => {
		seedSignedInTab();
		vi.spyOn(Storage.prototype, 'setItem').mockImplementation(failWith('QuotaExceededError'));

		await signOut();

		expect(authStore.getConnectionById(OverallAppSignIn).user).toBeNull();
		expectCachesEmpty();
		expect(localStorage.length).toBe(0);
		expect(sessionStorage.length).toBe(0);
	});

	it('still clears memory, the caches and sessionStorage when localStorage refuses removal', async () => {
		seedSignedInTab();
		const refusal = new DOMException('Storage refused.', 'SecurityError');
		vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(failWith('SecurityError'));
		const clear = Storage.prototype.clear;
		vi.spyOn(Storage.prototype, 'clear').mockImplementation(function(this: Storage) {
			if (this === localStorage) {
				throw refusal;
			}
			clear.call(this);
		});
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

		await signOut();

		expect(authStore.getConnectionById(OverallAppSignIn).user).toBeNull();
		expect(authStore.getConnectionById('ins-a').user).toBeNull();
		expectCachesEmpty();
		expect(sessionStorage.length).toBe(0);
		expect(consoleError).toHaveBeenCalledWith(refusal);
	});

	it('still wipes the caches and both stores when the store teardown throws', async () => {
		seedSignedInTab();
		const failure = new Error('teardown failed');
		vi.spyOn(authStore, 'signOutAllLocally').mockImplementation(() => {
			throw failure;
		});
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

		await signOut();

		expectCachesEmpty();
		expect(localStorage.length).toBe(0);
		expect(sessionStorage.length).toBe(0);
		expect(consoleError).toHaveBeenCalledWith(failure);
	});
});
