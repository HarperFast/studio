/** @vitest-environment jsdom */
import { authStore, OverallAppSignIn } from '@/features/auth/store/authStore';
import { seedSignInMarkers, storedSignInMarkers } from '@/features/auth/store/signInMarkersTestHelpers';
import { queryClient } from '@/react-query/queryClient';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearAuthStateAfterSignOutElsewhere, clearAuthStateLocally } from './clearAuthStateLocally';
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

function localStorageKeys(): Array<string | null> {
	return Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index));
}

function expectCachesEmpty() {
	expect(queryClient.getQueryCache().getAll()).toEqual([]);
	expect(queryClient.getMutationCache().getAll()).toEqual([]);
}

/**
 * Another tab that missed the sign-out's `storage` event reloads: fresh modules over the shared localStorage, and its
 * own sessionStorage, which still holds the explorer credential it stored before the sign-out.
 */
async function reloadTabHolding(explorerSettings: string): Promise<unknown> {
	sessionStorage.setItem('ApiExplorerSettings', explorerSettings);
	vi.resetModules();
	const { authStore: reloaded } = await import('@/features/auth/store/authStore');
	reloaded.installExplorerCrossTabCleanup()();
	return JSON.parse(sessionStorage.getItem('ApiExplorerSettings') ?? 'null');
}

/** Refuses every localStorage write while the filler is stored, as a full store does until the wipe removes it. */
function fillStorageUntilTheWipe() {
	localStorage.setItem('filler', 'the rest of the quota');
	const setItem = Storage.prototype.setItem;
	return vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function(this: Storage, key, value) {
		if (this === localStorage && localStorage.getItem('filler') !== null) {
			throw new DOMException('Storage is full.', 'QuotaExceededError');
		}
		setItem.call(this, key, value);
	});
}

function announcedUsers(setItem: ReturnType<typeof vi.spyOn<Storage, 'setItem'>>): unknown[] {
	const { calls, results } = setItem.mock;
	return calls.flatMap(([key, value], index) =>
		key === 'Studio:AppSignOut' && results[index]?.type === 'return'
			? [(JSON.parse(value) as { user: unknown }).user]
			: []
	);
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
		expect(localStorageKeys()).toEqual(['Studio:ExplorerAuthEpoch']);
		expect(sessionStorage.length).toBe(0);
	});

	it.each([1, 2])(
		'drops a credential stored before sign-out %i once a tab that missed the sign-out reloads',
		async (signOuts) => {
			for (let earlier = 1; earlier < signOuts; earlier++) {
				seedSignedInTab();
				await signOut();
			}
			const otherTabSettings = JSON.stringify({
				'ins-a': {
					method: 'bearer',
					auth: { type: 'bearer', token: 'other-tab' },
					authGeneration: authStore.getExplorerAuthEpoch('ins-a'),
				},
			});
			seedSignedInTab();

			await signOut();

			expect(await reloadTabHolding(otherTabSettings)).toEqual({ 'ins-a': { method: 'bearer' } });
		},
	);

	it('drops that credential when storage is too full to record the sign-out until the wipe', async () => {
		seedSignedInTab();
		localStorage.setItem('Studio:ExplorerAuthEpoch', JSON.stringify({ '*': 2 }));
		const otherTabSettings = JSON.stringify({
			'ins-a': {
				method: 'bearer',
				auth: { type: 'bearer', token: 'other-tab' },
				authGeneration: authStore.getExplorerAuthEpoch('ins-a'),
			},
		});
		fillStorageUntilTheWipe();

		await signOut();
		vi.restoreAllMocks();

		expect(await reloadTabHolding(otherTabSettings)).toEqual({ 'ins-a': { method: 'bearer' } });
	});

	it('still writes the refused generation when a removal fails during the wipe', async () => {
		seedSignedInTab();
		localStorage.setItem('Studio:ExplorerAuthEpoch', JSON.stringify({ '*': 2 }));
		const otherTabSettings = JSON.stringify({
			'ins-a': {
				method: 'bearer',
				auth: { type: 'bearer', token: 'other-tab' },
				authGeneration: authStore.getExplorerAuthEpoch('ins-a'),
			},
		});
		localStorage.setItem('Theme', 'dark');
		fillStorageUntilTheWipe();
		const refusal = new DOMException('Storage refused.', 'SecurityError');
		const removeItem = Storage.prototype.removeItem;
		vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(function(this: Storage, key) {
			if (this === localStorage && key === 'Theme') {
				throw refusal;
			}
			removeItem.call(this, key);
		});
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

		await signOut();
		expect(consoleError).toHaveBeenCalledWith(refusal);
		vi.restoreAllMocks();

		expect(await reloadTabHolding(otherTabSettings)).toEqual({ 'ins-a': { method: 'bearer' } });
	});

	it('announces the sign-out after the wipe when a full store refused it', async () => {
		seedSignedInTab();
		const setItem = fillStorageUntilTheWipe();

		await signOut();

		expect(announcedUsers(setItem)).toEqual(['usr_a']);
		expect(localStorage.getItem('Studio:AppSignOut')).toBeNull();
	});

	it('announces the sign-out once when storage has room', async () => {
		seedSignedInTab();
		const setItem = vi.spyOn(Storage.prototype, 'setItem');

		await signOut();

		expect(announcedUsers(setItem)).toEqual(['usr_a']);
	});

	it('keeps a credential stored after the sign-out when that tab reloads', async () => {
		seedSignedInTab();
		await signOut();
		const settings = {
			'ins-a': {
				method: 'bearer',
				auth: { type: 'bearer', token: 'next-session' },
				authGeneration: authStore.getExplorerAuthEpoch('ins-a'),
			},
		};

		expect(await reloadTabHolding(JSON.stringify(settings))).toEqual(settings);
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
		vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
			throw refusal;
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

describe('clearAuthStateAfterSignOutElsewhere', () => {
	it('signs this tab out and wipes both caches and its sessionStorage, but leaves the shared localStorage', () => {
		seedSignedInTab();
		localStorage.clear();
		seedSignInMarkers({ OverallAppSignIn });

		clearAuthStateAfterSignOutElsewhere();

		expect(authStore.getConnectionById(OverallAppSignIn).user).toBeNull();
		expect(authStore.getConnectionById('ins-a').user).toBeNull();
		expectCachesEmpty();
		expect(sessionStorage.length).toBe(0);
		expect(localStorage.length).toBe(1);
		expect(storedSignInMarkers()).toEqual({ OverallAppSignIn });
	});

	it('still wipes the caches and sessionStorage when the store teardown throws', () => {
		seedSignedInTab();
		const failure = new Error('teardown failed');
		vi.spyOn(authStore, 'forgetAppSignInEndedElsewhere').mockImplementation(() => {
			throw failure;
		});
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

		clearAuthStateAfterSignOutElsewhere();

		expectCachesEmpty();
		expect(sessionStorage.length).toBe(0);
		expect(consoleError).toHaveBeenCalledWith(failure);
	});
});
