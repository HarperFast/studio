/** @vitest-environment jsdom */
// jsdom: authStore touches localStorage at module load and throughout.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const user = { id: 'usr_a', email: 'a@example.com', roles: {} };

/** The store reads its markers at construction, so each case gets a fresh one. */
async function freshStore() {
	vi.resetModules();
	return import('./authStore');
}

beforeEach(() => {
	localStorage.clear();
	sessionStorage.clear();
});

describe('authStore.isKnownSignedOut', () => {
	it('has no answer for a sign-in nothing has checked or set, so the router context decides', async () => {
		const { authStore, OverallAppSignIn } = await freshStore();

		expect(authStore.isKnownSignedOut(OverallAppSignIn)).toBe(false);
		// Reading the connection creates one, but is not an answer either.
		expect(authStore.getConnectionById(OverallAppSignIn).user).toBeNull();
		expect(authStore.isKnownSignedOut(OverallAppSignIn)).toBe(false);
	});

	it('knows at once when a sign-out clears the session', async () => {
		localStorage.setItem('Studio:PotentiallyAuthenticated', JSON.stringify({ OverallAppSignIn: 'OverallAppSignIn' }));
		const { authStore, OverallAppSignIn } = await freshStore();
		authStore.setUserForIdAndKey(OverallAppSignIn, OverallAppSignIn, user as never);

		authStore.signOutAllLocally();

		expect(authStore.isKnownSignedOut(OverallAppSignIn)).toBe(true);
	});

	it('stops once the user signs back in', async () => {
		const { authStore, OverallAppSignIn } = await freshStore();
		authStore.signOutAllLocally();

		authStore.setUserForIdAndKey(OverallAppSignIn, OverallAppSignIn, user as never);

		expect(authStore.isKnownSignedOut(OverallAppSignIn)).toBe(false);
	});
});
