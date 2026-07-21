/** @vitest-environment jsdom */
// jsdom: authStore touches localStorage at module load and throughout.
import { beforeEach, describe, expect, it } from 'vitest';
import { authStore, OverallAppSignIn } from './authStore';

type SetArgs = Parameters<typeof authStore.setUserForIdAndKey>;

describe('authStore.signOutAllLocally', () => {
	beforeEach(() => {
		localStorage.clear();
		sessionStorage.clear();
	});

	it('clears the cloud slot and every entity connection/flag locally, without a network logout', () => {
		// Establish A's cloud session plus an authenticated instance with a Fabric flag.
		authStore.setUserForIdAndKey(OverallAppSignIn, OverallAppSignIn, { id: 'usr_a' } as SetArgs[2]);
		authStore.setUserForIdAndKey(
			'inst_1' as SetArgs[0],
			'https://inst-1' as SetArgs[1],
			{ username: 'u' } as SetArgs[2],
		);
		authStore.flagForFabricConnect('inst_1' as SetArgs[0], true);

		expect(authStore.getConnectionById(OverallAppSignIn).user).not.toBeNull();
		expect(authStore.getConnectionById('inst_1' as SetArgs[0]).user).not.toBeNull();
		expect(authStore.checkForFabricConnect('inst_1' as SetArgs[0])).toBe(true);

		authStore.signOutAllLocally();

		// Cross-user leak guard: nothing of A's survives in memory or storage.
		expect(authStore.getConnectionById(OverallAppSignIn).user).toBeNull();
		expect(authStore.getConnectionById('inst_1' as SetArgs[0]).user).toBeNull();
		expect(authStore.checkForFabricConnect('inst_1' as SetArgs[0])).toBe(false);
	});
});
