/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { legacySignInMarkersKey, signInMarkerKey } from './signInMarkers';
import { seedSignInMarkers, storedSignInMarkers } from './signInMarkersTestHelpers';

const { getInstanceUserInfo, onInstanceLogoutSubmit } = vi.hoisted(() => ({
	getInstanceUserInfo: vi.fn(),
	onInstanceLogoutSubmit: vi.fn(),
}));
vi.mock('@/integrations/api/instance/status/getInstanceUserInfo', () => ({ getInstanceUserInfo }));
vi.mock('@/integrations/api/instance/auth/onInstanceLogoutSubmit', () => ({ onInstanceLogoutSubmit }));

type Store = Awaited<ReturnType<typeof loadPage>>;
type SetArgs = Parameters<Store['setUserForIdAndKey']>;
const url = (id: string) => `https://${id}.example.com:9925/`;
const legacyMigratedKey = 'Studio:PotentiallyAuthenticatedMigrated';

/** The store reads its markers at construction, so each load is a fresh one. */
async function loadPage() {
	vi.resetModules();
	return (await import('./authStore')).authStore;
}

function legacy(): unknown {
	const raw = localStorage.getItem(legacySignInMarkersKey);
	return raw === null ? null : JSON.parse(raw);
}

// What a tab on a release before v2.199.0 writes: its whole load-time copy, every time.
function writeFromOlderRelease(markers: Record<string, string>) {
	localStorage.setItem(legacySignInMarkersKey, JSON.stringify(markers));
}

function signIn(store: Store, id: string) {
	store.setUserForIdAndKey(id as SetArgs[0], url(id) as SetArgs[1], { username: 'admin' } as SetArgs[2]);
}

function loggedOut() {
	return onInstanceLogoutSubmit.mock.calls.map(([{ entityId, instanceClient }]) => [
		entityId,
		instanceClient.defaults.baseURL,
	]);
}

function refuseWrites() {
	return vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
		throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
	});
}

beforeEach(() => {
	localStorage.clear();
	onInstanceLogoutSubmit.mockResolvedValue({ message: 'ok' });
	vi.spyOn(console, 'debug').mockImplementation(() => undefined);
});

afterEach(() => {
	vi.resetAllMocks();
	vi.restoreAllMocks();
});

describe('a load that finds the record an older release kept', () => {
	it('moves its markers into one key per entity, then deletes it', async () => {
		writeFromOlderRelease({ OverallAppSignIn: 'OverallAppSignIn', 'ins-a': url('ins-a') });

		const store = await loadPage();

		expect(storedSignInMarkers()).toEqual({ OverallAppSignIn: 'OverallAppSignIn', 'ins-a': url('ins-a') });
		expect(store.getOperationsUrl('ins-a')).toBe(url('ins-a'));
		expect(legacy()).toBeNull();
	});

	it('keeps a marker already stored for an entity over the legacy one', async () => {
		seedSignInMarkers({ 'ins-a': 'https://ins-a-2.example.com:9925/' });
		writeFromOlderRelease({ 'ins-a': url('ins-a') });

		await loadPage();

		expect(storedSignInMarkers()).toEqual({ 'ins-a': 'https://ins-a-2.example.com:9925/' });
	});

	it('moves only the entries that are markers, and deletes the rest with it', async () => {
		localStorage.setItem(legacySignInMarkersKey, JSON.stringify({ 'ins-a': url('ins-a'), 'ins-b': 123, 'ins-c': '' }));

		await loadPage();

		expect(storedSignInMarkers()).toEqual({ 'ins-a': url('ins-a') });
		expect(legacy()).toBeNull();
	});

	it.each([
		['an array', JSON.stringify([url('ins-a')])],
		['not JSON', 'ins-a'],
		['null', 'null'],
		['a record of no markers', JSON.stringify({ 'ins-a': 123 })],
	])('deletes a legacy record that is %s, and moves nothing', async (_, junk) => {
		localStorage.setItem(legacySignInMarkersKey, junk);

		await loadPage();

		expect(localStorage.getItem(legacySignInMarkersKey)).toBeNull();
		expect(storedSignInMarkers()).toEqual({});
	});

	it('gives an app sign-out the sign-ins of a user who never loaded a release that copied it', async () => {
		writeFromOlderRelease({ OverallAppSignIn: 'OverallAppSignIn', 'ins-old': url('ins-old') });
		localStorage.setItem('Studio:BasicAuth:ins-old', btoa(JSON.stringify({ username: 'admin', password: 'hunter2' })));
		const store = await loadPage();

		await store.signOutFromPotentiallyAuthenticatedInstances();

		expect(loggedOut()).toEqual([['ins-old', url('ins-old')]]);
		expect(storedSignInMarkers()).toEqual({});
		expect(store.checkForBasicAuth('ins-old')).toBeUndefined();
	});

	it("moves it even after a release that kept it in step had, and deletes that release's flag", async () => {
		localStorage.setItem(legacyMigratedKey, '1');
		writeFromOlderRelease({ 'ins-a': url('ins-a') });

		await loadPage();

		expect(storedSignInMarkers()).toEqual({ 'ins-a': url('ins-a') });
		expect(localStorage.getItem(legacyMigratedKey)).toBeNull();
	});

	it('still signs in and out on its markers when storage refuses to copy them', async () => {
		writeFromOlderRelease({ 'ins-a': url('ins-a') });
		refuseWrites();

		const store = await loadPage();

		expect(store.getOperationsUrl('ins-a')).toBe(url('ins-a'));
		await store.signOutFromPotentiallyAuthenticatedInstances();
		expect(loggedOut()).toEqual([['ins-a', url('ins-a')]]);
	});

	it('keeps it for a later load when storage refuses to copy it', async () => {
		writeFromOlderRelease({ 'ins-a': url('ins-a') });
		const refused = refuseWrites();
		await loadPage();
		expect(legacy()).toEqual({ 'ins-a': url('ins-a') });
		refused.mockRestore();

		await loadPage();

		expect(storedSignInMarkers()).toEqual({ 'ins-a': url('ins-a') });
		expect(legacy()).toBeNull();
	});

	it('keeps it for the next load when an older tab rewrites it during the copy', async () => {
		writeFromOlderRelease({ 'ins-a': url('ins-a') });
		const setItem = Storage.prototype.setItem;
		const rewrite = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(
			function(this: Storage, key: string, value: string) {
				setItem.call(this, key, value);
				if (key === signInMarkerKey('ins-a')) {
					setItem.call(this, legacySignInMarkersKey, JSON.stringify({ 'ins-a': url('ins-a'), 'ins-x': url('ins-x') }));
				}
			},
		);
		await loadPage();
		rewrite.mockRestore();
		expect(legacy()).toEqual({ 'ins-a': url('ins-a'), 'ins-x': url('ins-x') });

		await loadPage();

		expect(storedSignInMarkers()).toEqual({ 'ins-a': url('ins-a'), 'ins-x': url('ins-x') });
		expect(legacy()).toBeNull();
	});

	it("still moves it when storage won't remove the old migration flag", async () => {
		writeFromOlderRelease({ 'ins-a': url('ins-a') });
		const removeItem = Storage.prototype.removeItem;
		vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(function(this: Storage, key: string) {
			if (key === legacyMigratedKey) {
				throw new DOMException('Storage refused.', 'SecurityError');
			}
			removeItem.call(this, key);
		});

		const store = await loadPage();

		expect(store.getOperationsUrl('ins-a')).toBe(url('ins-a'));
		expect(storedSignInMarkers()).toEqual({ 'ins-a': url('ins-a') });
	});

	it("starts without its markers when storage won't read it", async () => {
		writeFromOlderRelease({ 'ins-a': url('ins-a') });
		const getItem = Storage.prototype.getItem;
		vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function(this: Storage, key: string) {
			if (key === legacySignInMarkersKey) {
				throw new DOMException('Storage refused.', 'SecurityError');
			}
			return getItem.call(this, key);
		});

		const store = await loadPage();

		expect(store.getOperationsUrl('ins-a')).toBeUndefined();
	});
});

describe("a record an older release's tab writes back after this load", () => {
	it('is moved at the next load, and deleted again', async () => {
		const store = await loadPage();
		signIn(store, 'ins-here');
		writeFromOlderRelease({ 'ins-old': url('ins-old') });

		await loadPage();

		expect(storedSignInMarkers()).toEqual({ 'ins-here': url('ins-here'), 'ins-old': url('ins-old') });
		expect(legacy()).toBeNull();
	});

	it('brings back a sign-in signed out here only until a check finds its session ended', async () => {
		writeFromOlderRelease({ 'ins-a': url('ins-a') });
		(await loadPage()).signOutLocally('ins-a');
		writeFromOlderRelease({ 'ins-a': url('ins-a') });
		const next = await loadPage();
		expect(next.getOperationsUrl('ins-a')).toBe(url('ins-a'));
		getInstanceUserInfo.mockRejectedValue(new Error('Request failed with status code 401'));
		vi.spyOn(console, 'error').mockImplementation(() => undefined);

		await next.reloadUser('ins-a');

		expect(storedSignInMarkers()).toEqual({});
	});

	it.each([
		['an app sign-out', (store: Store) => store.signOutFromPotentiallyAuthenticatedInstances()],
		['signOutEntities', (store: Store) => store.signOutEntities(['ins-old'])],
	])("isn't read by %s", async (_, signOut) => {
		const store = await loadPage();
		writeFromOlderRelease({ 'ins-old': url('ins-old') });

		await signOut(store);

		expect(onInstanceLogoutSubmit).not.toHaveBeenCalled();
		expect(legacy()).toEqual({ 'ins-old': url('ins-old') });
	});
});

describe("this release's sign-ins, sign-outs and checks", () => {
	it("don't create the legacy record", async () => {
		const store = await loadPage();

		signIn(store, 'ins-a');

		expect(legacy()).toBeNull();
	});

	it('never write a legacy record an older release wrote back', async () => {
		const store = await loadPage();
		signIn(store, 'ins-b');
		writeFromOlderRelease({ 'ins-a': url('ins-a'), 'ins-b': url('ins-b') });
		const setItem = vi.spyOn(Storage.prototype, 'setItem');
		const removeItem = vi.spyOn(Storage.prototype, 'removeItem');
		getInstanceUserInfo.mockRejectedValue(new Error('Network Error'));
		vi.spyOn(console, 'error').mockImplementation(() => undefined);

		signIn(store, 'ins-c');
		store.signOutLocally('ins-a');
		await store.reloadUser('ins-b');

		const legacyWrites = [...setItem.mock.calls, ...removeItem.mock.calls].filter(([key]) =>
			key === legacySignInMarkersKey
		);
		expect(legacyWrites).toEqual([]);
		expect(legacy()).toEqual({ 'ins-a': url('ins-a'), 'ins-b': url('ins-b') });
		expect(storedSignInMarkers()).toEqual({ 'ins-c': url('ins-c') });
	});
});
