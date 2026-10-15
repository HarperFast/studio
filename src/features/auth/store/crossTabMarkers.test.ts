/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authStore } from './authStore';

const { getInstanceUserInfo, onInstanceLogoutSubmit } = vi.hoisted(() => ({
	getInstanceUserInfo: vi.fn(),
	onInstanceLogoutSubmit: vi.fn(),
}));
vi.mock('@/integrations/api/instance/status/getInstanceUserInfo', () => ({ getInstanceUserInfo }));
vi.mock('@/integrations/api/instance/auth/onInstanceLogoutSubmit', () => ({ onInstanceLogoutSubmit }));

type SetArgs = Parameters<typeof authStore.setUserForIdAndKey>;
const MARKERS = 'Studio:PotentiallyAuthenticated';
const ENTITIES = ['ins-here', 'ins-other-tab'];
const url = (id: string) => `https://${id}.example.com:9925/`;

function signInHere(id: string) {
	authStore.setUserForIdAndKey(id as SetArgs[0], url(id) as SetArgs[1], { username: 'admin' } as SetArgs[2]);
}

function stored(): Record<string, string> {
	return JSON.parse(localStorage.getItem(MARKERS) || '{}');
}

// What another tab's sign-in leaves: its marker and Basic Auth credential, written after this tab read its copy.
function signInInAnotherTab(id: string) {
	localStorage.setItem(MARKERS, JSON.stringify({ ...stored(), [id]: url(id) }));
	localStorage.setItem(`Studio:BasicAuth:${id}`, btoa(JSON.stringify({ username: 'admin', password: 'hunter2' })));
}

beforeEach(() => {
	localStorage.clear();
	onInstanceLogoutSubmit.mockResolvedValue({ message: 'ok' });
	vi.spyOn(console, 'debug').mockImplementation(() => undefined);
});

afterEach(() => {
	vi.resetAllMocks();
	vi.restoreAllMocks();
	ENTITIES.forEach((id) => authStore.signOutLocally(id));
	localStorage.clear();
});

describe('sign-in markers another tab added', () => {
	it('survive a sign-in in this tab', () => {
		signInInAnotherTab('ins-other-tab');

		signInHere('ins-here');

		expect(stored()).toEqual({ 'ins-other-tab': url('ins-other-tab'), 'ins-here': url('ins-here') });
	});

	it('survive a sign-out in this tab', () => {
		signInHere('ins-here');
		signInInAnotherTab('ins-other-tab');

		authStore.signOutLocally('ins-here');

		expect(stored()).toEqual({ 'ins-other-tab': url('ins-other-tab') });
	});

	it('go when this tab signs the same entity out', () => {
		signInInAnotherTab('ins-other-tab');

		authStore.signOutLocally('ins-other-tab');

		expect(stored()).toEqual({});
	});

	it('get a logout, and go, at an app sign-out from this tab', async () => {
		signInHere('ins-here');
		signInInAnotherTab('ins-other-tab');

		await authStore.signOutFromPotentiallyAuthenticatedInstances();

		const loggedOut = onInstanceLogoutSubmit.mock.calls.map(([{ entityId, instanceClient }]) => [
			entityId,
			instanceClient.defaults.baseURL,
		]);
		expect(loggedOut).toEqual([['ins-here', url('ins-here')], ['ins-other-tab', url('ins-other-tab')]]);
		expect(stored()).toEqual({});
		expect(authStore.checkForBasicAuth('ins-other-tab')).toBeUndefined();
	});

	it('go, with their credentials, at a local full sign-out', () => {
		signInInAnotherTab('ins-other-tab');

		authStore.signOutAllLocally();

		expect(stored()).toEqual({});
		expect(authStore.checkForBasicAuth('ins-other-tab')).toBeUndefined();
	});

	it('stay out of a sign-in this tab makes when it cannot read them', () => {
		signInHere('ins-here');
		localStorage.setItem(MARKERS, JSON.stringify({}));
		const getItem = Storage.prototype.getItem;
		vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function(this: Storage, key: string) {
			if (key === MARKERS) {
				throw new DOMException('Storage refused.', 'SecurityError');
			}
			return getItem.call(this, key);
		});

		signInHere('ins-other-tab');
		vi.restoreAllMocks();

		expect(stored()).toEqual({ 'ins-other-tab': url('ins-other-tab') });
	});

	it('that are not a record get no logout at an app sign-out', async () => {
		localStorage.setItem(MARKERS, JSON.stringify([url('ins-other-tab')]));

		await authStore.signOutFromPotentiallyAuthenticatedInstances();

		expect(onInstanceLogoutSubmit).not.toHaveBeenCalled();
	});
});

describe('a sign-in another tab made again at a newer URL', () => {
	const newer = 'https://ins-here-2.example.com:9925/';

	function loggedOutAt() {
		return onInstanceLogoutSubmit.mock.calls.map(([{ instanceClient }]) => instanceClient.defaults.baseURL);
	}

	beforeEach(() => {
		signInHere('ins-here');
		localStorage.setItem(MARKERS, JSON.stringify({ 'ins-here': newer }));
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
		localStorage.setItem(MARKERS, JSON.stringify({}));

		await authStore.reloadUser('ins-here');

		expect(stored()).toEqual({});
	});

	it('keeps, when it passes, the operations URL another tab has signed in with since', async () => {
		signInHere('ins-here');
		const newer = { 'ins-here': 'https://ins-here-2.example.com:9925/' };
		localStorage.setItem(MARKERS, JSON.stringify(newer));

		await authStore.reloadUser('ins-here');

		expect(stored()).toEqual(newer);
	});

	it("keeps that newer URL when it fails against this tab's older one", async () => {
		signInHere('ins-here');
		const newer = { 'ins-here': 'https://ins-here-2.example.com:9925/' };
		localStorage.setItem(MARKERS, JSON.stringify(newer));
		getInstanceUserInfo.mockRejectedValue(new Error('Network Error'));
		vi.spyOn(console, 'error').mockImplementation(() => undefined);

		await authStore.reloadUser('ins-here');

		expect(stored()).toEqual(newer);
	});
});
