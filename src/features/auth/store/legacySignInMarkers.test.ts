/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { legacySignInMarkersKey, migrateLegacySignInMarkers } from './signInMarkers';
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

/** The store reads its markers at construction, so each load is a fresh one. */
async function loadPage() {
	vi.resetModules();
	return (await import('./authStore')).authStore;
}

function legacy(): unknown {
	const raw = localStorage.getItem(legacySignInMarkersKey);
	return raw === null ? null : JSON.parse(raw);
}

// What a tab on the previous release writes: its whole load-time copy, every time.
function writeFromPreviousRelease(markers: Record<string, string>) {
	localStorage.setItem(legacySignInMarkersKey, JSON.stringify(markers));
}

function signIn(store: Store, id: string) {
	store.setUserForIdAndKey(id as SetArgs[0], url(id) as SetArgs[1], { username: 'admin' } as SetArgs[2]);
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

describe('the first load of this release', () => {
	it("moves the previous release's markers into one key per entity", async () => {
		writeFromPreviousRelease({ OverallAppSignIn: 'OverallAppSignIn', 'ins-a': url('ins-a') });

		const store = await loadPage();

		expect(storedSignInMarkers()).toEqual({ OverallAppSignIn: 'OverallAppSignIn', 'ins-a': url('ins-a') });
		expect(store.getOperationsUrl('ins-a')).toBe(url('ins-a'));
	});

	it('keeps a marker already stored for an entity over the legacy one', async () => {
		seedSignInMarkers({ 'ins-a': 'https://ins-a-2.example.com:9925/' });
		writeFromPreviousRelease({ 'ins-a': url('ins-a') });

		await loadPage();

		expect(storedSignInMarkers()).toEqual({ 'ins-a': 'https://ins-a-2.example.com:9925/' });
	});

	it('writes the same markers when another tab migrates at the same time', () => {
		writeFromPreviousRelease({ 'ins-a': url('ins-a'), 'ins-b': url('ins-b') });

		migrateLegacySignInMarkers();
		const once = storedSignInMarkers();
		localStorage.removeItem('Studio:PotentiallyAuthenticatedMigrated');
		migrateLegacySignInMarkers();

		expect(storedSignInMarkers()).toEqual(once);
	});

	it.each([
		['an array', JSON.stringify([url('ins-a')])],
		['not JSON', 'ins-a'],
		['null', 'null'],
	])('removes a legacy record that is %s, and moves nothing', async (_, junk) => {
		localStorage.setItem(legacySignInMarkersKey, junk);

		await loadPage();

		expect(localStorage.getItem(legacySignInMarkersKey)).toBeNull();
		expect(storedSignInMarkers()).toEqual({});
	});

	it("drops entries that aren't markers from the legacy record", async () => {
		localStorage.setItem(legacySignInMarkersKey, JSON.stringify({ 'ins-a': url('ins-a'), 'ins-b': 123, 'ins-c': '' }));

		await loadPage();

		expect(legacy()).toEqual({ 'ins-a': url('ins-a') });
	});

	it("still signs in on the previous release's markers when storage refuses the migration", async () => {
		writeFromPreviousRelease({ 'ins-a': url('ins-a') });
		vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
		});

		const store = await loadPage();

		expect(store.getOperationsUrl('ins-a')).toBe(url('ins-a'));
	});
});

describe('a later load', () => {
	it('brings back nothing a previous-release tab wrote back after this release signed it out', async () => {
		writeFromPreviousRelease({ 'ins-a': url('ins-a') });
		const store = await loadPage();
		store.signOutLocally('ins-a');

		writeFromPreviousRelease({ 'ins-a': url('ins-a') });
		await loadPage();

		expect(storedSignInMarkers()).toEqual({});
	});

	it('brings back nothing written after a full sign-out, which keeps the record migrated', async () => {
		writeFromPreviousRelease({ 'ins-a': url('ins-a') });
		const store = await loadPage();
		store.signOutAllLocally();
		store.wipeLocalStorageForSignOut();

		writeFromPreviousRelease({ 'ins-a': url('ins-a') });
		await loadPage();

		expect(storedSignInMarkers()).toEqual({});
	});

	it('keeps the record migrated through a full sign-out whose writes storage refuses', async () => {
		writeFromPreviousRelease({ 'ins-a': url('ins-a') });
		const store = await loadPage();
		store.signOutAllLocally();
		vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
		});
		vi.spyOn(console, 'debug').mockImplementation(() => undefined);
		store.wipeLocalStorageForSignOut();
		vi.restoreAllMocks();

		writeFromPreviousRelease({ 'ins-a': url('ins-a') });
		await loadPage();

		expect(storedSignInMarkers()).toEqual({});
	});

	it("brings back nothing written after a full sign-out, even when the first migration didn't land", async () => {
		writeFromPreviousRelease({ 'ins-a': url('ins-a') });
		const refused = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
		});
		const store = await loadPage();
		refused.mockRestore();
		store.signOutAllLocally();
		store.wipeLocalStorageForSignOut();

		writeFromPreviousRelease({ 'ins-a': url('ins-a') });
		const next = await loadPage();

		expect(next.getOperationsUrl('ins-a')).toBeUndefined();
	});

	it("doesn't sign back in on a write-back when it can't clean the record", async () => {
		writeFromPreviousRelease({ 'ins-a': url('ins-a') });
		const store = await loadPage();
		store.signOutLocally('ins-a');
		localStorage.setItem(legacySignInMarkersKey, JSON.stringify({ 'ins-a': url('ins-a'), junk: 1 }));
		vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
		});

		const next = await loadPage();

		expect(next.getOperationsUrl('ins-a')).toBeUndefined();
	});

	it('still removes a legacy record that is not one', async () => {
		await loadPage();
		localStorage.setItem(legacySignInMarkersKey, JSON.stringify([url('ins-a')]));

		await loadPage();

		expect(localStorage.getItem(legacySignInMarkersKey)).toBeNull();
	});
});

describe('for tabs still on the previous release', () => {
	it('mirrors each sign-in and sign-out into the legacy record, leaving its other markers', async () => {
		writeFromPreviousRelease({ 'ins-old': url('ins-old') });
		const store = await loadPage();

		signIn(store, 'ins-a');
		expect(legacy()).toEqual({ 'ins-old': url('ins-old'), 'ins-a': url('ins-a') });

		store.signOutLocally('ins-a');
		expect(legacy()).toEqual({ 'ins-old': url('ins-old') });
	});

	it('creates the legacy record when there is none, so a rollback still sees the sign-in', async () => {
		const store = await loadPage();

		signIn(store, 'ins-a');

		expect(legacy()).toEqual({ 'ins-a': url('ins-a') });
	});

	it("keeps a newer URL that tab recorded when a check of this tab's older one fails", async () => {
		const store = await loadPage();
		signIn(store, 'ins-a');
		writeFromPreviousRelease({ 'ins-a': 'https://ins-a-2.example.com:9925/' });
		getInstanceUserInfo.mockRejectedValue(new Error('Network Error'));
		vi.spyOn(console, 'error').mockImplementation(() => undefined);

		await store.reloadUser('ins-a');

		expect(legacy()).toEqual({ 'ins-a': 'https://ins-a-2.example.com:9925/' });
	});

	it("leaves a legacy record it can't read alone at a sign-in", async () => {
		const store = await loadPage();
		localStorage.setItem(legacySignInMarkersKey, 'not a record');

		signIn(store, 'ins-a');

		expect(localStorage.getItem(legacySignInMarkersKey)).toBe('not a record');
	});

	it("keeps the whole legacy record when it can't mirror a failed check", async () => {
		writeFromPreviousRelease({ 'ins-old': url('ins-old') });
		const store = await loadPage();
		signIn(store, 'ins-a');
		getInstanceUserInfo.mockRejectedValue(new Error('Network Error'));
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const setItem = Storage.prototype.setItem;
		vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function(this: Storage, key: string, value: string) {
			if (key === legacySignInMarkersKey) {
				throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
			}
			setItem.call(this, key, value);
		});

		await store.reloadUser('ins-a');

		expect(legacy()).toEqual({ 'ins-old': url('ins-old'), 'ins-a': url('ins-a') });
	});

	it('takes the whole legacy record when it cannot mirror a sign-out', async () => {
		writeFromPreviousRelease({ 'ins-a': url('ins-a'), 'ins-old': url('ins-old') });
		const store = await loadPage();
		const setItem = Storage.prototype.setItem;
		vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function(this: Storage, key: string, value: string) {
			if (key === legacySignInMarkersKey) {
				throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
			}
			setItem.call(this, key, value);
		});

		store.signOutLocally('ins-a');

		expect(legacy()).toBeNull();
	});

	it('gives an app sign-out a sign-in only a previous-release tab recorded, and forgets it', async () => {
		const store = await loadPage();
		writeFromPreviousRelease({ 'ins-old': url('ins-old') });
		localStorage.setItem('Studio:BasicAuth:ins-old', btoa(JSON.stringify({ username: 'admin', password: 'hunter2' })));

		await store.signOutFromPotentiallyAuthenticatedInstances();

		expect(onInstanceLogoutSubmit.mock.calls.map(([{ entityId, instanceClient }]) => [
			entityId,
			instanceClient.defaults.baseURL,
		])).toEqual([['ins-old', url('ins-old')]]);
		expect(legacy()).toEqual({});
		expect(store.checkForBasicAuth('ins-old')).toBeUndefined();
	});

	it('gives signOutEntities a sign-in only a previous-release tab recorded', async () => {
		const store = await loadPage();
		writeFromPreviousRelease({ 'ins-old': url('ins-old') });

		await store.signOutEntities(['ins-old']);

		expect(onInstanceLogoutSubmit.mock.calls.map(([{ entityId }]) => entityId)).toEqual(['ins-old']);
		expect(legacy()).toEqual({});
	});

	it('gives an app sign-out no entity from a legacy record that is not one', async () => {
		const store = await loadPage();
		localStorage.setItem(legacySignInMarkersKey, JSON.stringify([url('ins-old')]));

		await store.signOutFromPotentiallyAuthenticatedInstances();

		expect(onInstanceLogoutSubmit).not.toHaveBeenCalled();
	});
});
