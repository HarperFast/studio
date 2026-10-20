/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authStore, OverallAppSignIn } from './authStore';
import { legacySignInMarkersKey, signInMarkerKey } from './signInMarkers';
import { seedSignInMarkers, storedSignInMarkers } from './signInMarkersTestHelpers';

const { fetchCurrentUser, getInstanceUserInfo, onInstanceLogoutSubmit } = vi.hoisted(() => ({
	fetchCurrentUser: vi.fn(),
	getInstanceUserInfo: vi.fn(),
	onInstanceLogoutSubmit: vi.fn(),
}));
vi.mock('@/features/auth/queries/getCurrentUser', () => ({ fetchCurrentUser }));
vi.mock('@/integrations/api/instance/status/getInstanceUserInfo', () => ({ getInstanceUserInfo }));
vi.mock('@/integrations/api/instance/auth/onInstanceLogoutSubmit', () => ({ onInstanceLogoutSubmit }));

type SetArgs = Parameters<typeof authStore.setUserForIdAndKey>;
const ENTITIES = ['ins-here', 'ins-other-tab'];
const url = (id: string) => `https://${id}.example.com:9925/`;
const newer = 'https://ins-here-2.example.com:9925/';

function signInHere(id: string, at = url(id)) {
	authStore.setUserForIdAndKey(id as SetArgs[0], at as SetArgs[1], { username: 'admin' } as SetArgs[2]);
}

function signInInAnotherTab(id: string) {
	seedSignInMarkers({ [id]: url(id) });
	localStorage.setItem(`Studio:BasicAuth:${id}`, btoa(JSON.stringify({ username: 'admin', password: 'hunter2' })));
}

function loggedOut() {
	return onInstanceLogoutSubmit.mock.calls.map(([{ entityId, instanceClient }]) => [
		entityId,
		instanceClient.defaults.baseURL,
	]);
}

beforeEach(() => {
	localStorage.clear();
	onInstanceLogoutSubmit.mockResolvedValue({ message: 'ok' });
	vi.spyOn(console, 'debug').mockImplementation(() => undefined);
});

afterEach(() => {
	vi.resetAllMocks();
	vi.restoreAllMocks();
	[...ENTITIES, OverallAppSignIn].forEach((id) => authStore.signOutLocally(id));
	localStorage.clear();
});

describe('sign-in markers another tab added', () => {
	it('survive a sign-in in this tab', () => {
		signInInAnotherTab('ins-other-tab');

		signInHere('ins-here');

		expect(storedSignInMarkers()).toEqual({ 'ins-other-tab': url('ins-other-tab'), 'ins-here': url('ins-here') });
	});

	it('survive a sign-out in this tab', () => {
		signInHere('ins-here');
		signInInAnotherTab('ins-other-tab');

		authStore.signOutLocally('ins-here');

		expect(storedSignInMarkers()).toEqual({ 'ins-other-tab': url('ins-other-tab') });
	});

	it('go when this tab signs the same entity out', () => {
		signInInAnotherTab('ins-other-tab');

		authStore.signOutLocally('ins-other-tab');

		expect(storedSignInMarkers()).toEqual({});
	});

	it('get a logout, and go, at an app sign-out from this tab', async () => {
		signInHere('ins-here');
		signInInAnotherTab('ins-other-tab');

		await authStore.signOutFromPotentiallyAuthenticatedInstances();

		expect(loggedOut()).toEqual([['ins-here', url('ins-here')], ['ins-other-tab', url('ins-other-tab')]]);
		expect(storedSignInMarkers()).toEqual({});
		expect(authStore.checkForBasicAuth('ins-other-tab')).toBeUndefined();
	});

	it('go, with their credentials, at a local full sign-out', () => {
		signInInAnotherTab('ins-other-tab');

		authStore.signOutAllLocally();

		expect(storedSignInMarkers()).toEqual({});
		expect(authStore.checkForBasicAuth('ins-other-tab')).toBeUndefined();
	});
});

describe("a sign-in's marker", () => {
	it('is the only one its sign-in writes, beside the legacy record', () => {
		signInInAnotherTab('ins-other-tab');
		const setItem = vi.spyOn(Storage.prototype, 'setItem');

		signInHere('ins-here');

		expect(setItem.mock.calls.map(([key]) => key)).toEqual([signInMarkerKey('ins-here'), legacySignInMarkersKey]);
	});

	it('is the only one its sign-out removes', () => {
		signInHere('ins-here');
		signInInAnotherTab('ins-other-tab');
		const removeItem = vi.spyOn(Storage.prototype, 'removeItem');

		authStore.signOutLocally('ins-here');

		expect(removeItem.mock.calls.map(([key]) => key)).not.toContain(signInMarkerKey('ins-other-tab'));
	});
});

describe('a sign-in this tab already remembers', () => {
	it('records itself again when another tab signed it out', () => {
		signInHere('ins-here');
		localStorage.removeItem(signInMarkerKey('ins-here'));

		signInHere('ins-here');

		expect(storedSignInMarkers()).toEqual({ 'ins-here': url('ins-here') });
	});
});

describe('the app sign-in', () => {
	const signInApp = (user: object) =>
		authStore.setUserForIdAndKey(OverallAppSignIn, OverallAppSignIn, user as SetArgs[2]);

	it("isn't put back by a /User/current answer after another tab's failed check dropped it", () => {
		signInApp({ id: 'usr_a' });
		localStorage.removeItem(signInMarkerKey(OverallAppSignIn));

		authStore.syncAppUser({ id: 'usr_a' } as never);

		expect(storedSignInMarkers()).toEqual({});
	});

	it('records an explicit sign-in again, even while this tab still holds the marker', () => {
		signInApp({ id: 'usr_a' });
		localStorage.removeItem(signInMarkerKey(OverallAppSignIn));

		signInApp({ id: 'usr_a' });

		expect(storedSignInMarkers()).toEqual({ [OverallAppSignIn]: OverallAppSignIn });
	});

	it('still applies its own answer when a /User/current answer lands while it is out', async () => {
		signInApp({ id: 'usr_a' });
		let answer: (user: unknown) => void = () => undefined;
		fetchCurrentUser.mockReturnValue(
			new Promise((resolve) => {
				answer = resolve;
			}),
		);
		const check = authStore.reloadUser(OverallAppSignIn);
		const checked = { id: 'usr_a', checked: true };

		authStore.syncAppUser({ id: 'usr_a', synced: true } as never);
		answer(checked);
		await check;

		expect(authStore.getConnectionById(OverallAppSignIn).user).toBe(checked);
	});

	it('stays signed in when a check that was out during a new sign-in fails', async () => {
		signInApp({ id: 'usr_a' });
		let answer: (reason: unknown) => void = () => undefined;
		fetchCurrentUser.mockReturnValue(
			new Promise((_, reject) => {
				answer = reject;
			}),
		);
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const check = authStore.reloadUser(OverallAppSignIn);

		signInApp({ id: 'usr_b' });
		answer(new Error('timeout of 60000ms exceeded'));
		await check;

		expect(authStore.getConnectionById(OverallAppSignIn).user).toEqual({ id: 'usr_b' });
		expect(storedSignInMarkers()).toHaveProperty(OverallAppSignIn);
	});

	it("drops a passing check's answer about the session a sign-in made meanwhile replaced", async () => {
		signInApp({ id: 'usr_a' });
		let answer: (user: unknown) => void = () => undefined;
		fetchCurrentUser.mockReturnValue(
			new Promise((resolve) => {
				answer = resolve;
			}),
		);
		const check = authStore.reloadUser(OverallAppSignIn);

		signInApp({ id: 'usr_b' });
		answer({ id: 'usr_a' });
		await check;

		expect(authStore.getConnectionById(OverallAppSignIn).user).toEqual({ id: 'usr_b' });
	});
});

describe('a sign-in another tab made again at a newer URL', () => {
	function loggedOutAt() {
		return onInstanceLogoutSubmit.mock.calls.map(([{ instanceClient }]) => instanceClient.defaults.baseURL);
	}

	beforeEach(() => {
		signInHere('ins-here');
		seedSignInMarkers({ 'ins-here': newer });
	});

	it('gets a logout at both URLs at an app sign-out', async () => {
		await authStore.signOutFromPotentiallyAuthenticatedInstances();

		expect(loggedOutAt()).toEqual([url('ins-here'), newer]);
	});

	it('gets a logout at both URLs from signOutEntities', async () => {
		await authStore.signOutEntities(['ins-here']);

		expect(loggedOutAt()).toEqual([url('ins-here'), newer]);
	});
});

describe('a check of a sign-in this tab remembers', () => {
	beforeEach(() => {
		getInstanceUserInfo.mockResolvedValue({ username: 'admin' });
	});

	it('leaves out, when it passes, the marker of another tab that signed it out', async () => {
		signInHere('ins-here');
		localStorage.removeItem(signInMarkerKey('ins-here'));

		await authStore.reloadUser('ins-here');

		expect(storedSignInMarkers()).toEqual({});
	});

	it('keeps, when it passes, the operations URL another tab has signed in with since', async () => {
		signInHere('ins-here');
		seedSignInMarkers({ 'ins-here': newer });

		await authStore.reloadUser('ins-here');

		expect(storedSignInMarkers()).toEqual({ 'ins-here': newer });
	});

	it("keeps that newer URL when it fails against this tab's older one", async () => {
		signInHere('ins-here');
		seedSignInMarkers({ 'ins-here': newer });
		getInstanceUserInfo.mockRejectedValue(new Error('Network Error'));
		vi.spyOn(console, 'error').mockImplementation(() => undefined);

		await authStore.reloadUser('ins-here');

		expect(storedSignInMarkers()).toEqual({ 'ins-here': newer });
	});

	it('leaves a sign-in this tab made at another URL while it was out', async () => {
		signInHere('ins-here');
		let answer: (reason: unknown) => void = () => undefined;
		getInstanceUserInfo.mockReturnValue(
			new Promise((_, reject) => {
				answer = reject;
			}),
		);
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const check = authStore.reloadUser('ins-here');

		signInHere('ins-here', newer);
		answer(new Error('Network Error'));
		await check;

		expect(authStore.getOperationsUrl('ins-here')).toBe(newer);
		expect(authStore.getConnectionById('ins-here').user).toEqual({ username: 'admin' });
		expect(storedSignInMarkers()).toEqual({ 'ins-here': newer });
	});

	it("leaves the marker alone when it fails and can't read it", async () => {
		signInHere('ins-here');
		getInstanceUserInfo.mockRejectedValue(new Error('Network Error'));
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const getItem = Storage.prototype.getItem;
		vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function(this: Storage, key: string) {
			if (key === signInMarkerKey('ins-here')) {
				throw new DOMException('Storage refused.', 'SecurityError');
			}
			return getItem.call(this, key);
		});

		await authStore.reloadUser('ins-here');
		vi.mocked(Storage.prototype.getItem).mockRestore();

		expect(storedSignInMarkers()).toEqual({ 'ins-here': url('ins-here') });
	});

	it('leaves a sign-in this tab made at the same URL while it was out', async () => {
		signInHere('ins-here');
		let answer: (reason: unknown) => void = () => undefined;
		getInstanceUserInfo.mockReturnValue(
			new Promise((_, reject) => {
				answer = reject;
			}),
		);
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const check = authStore.reloadUser('ins-here');

		signInHere('ins-here');
		answer(new Error('Network Error'));
		await check;

		expect(authStore.getConnectionById('ins-here').user).toEqual({ username: 'admin' });
		expect(storedSignInMarkers()).toEqual({ 'ins-here': url('ins-here') });
	});
});
