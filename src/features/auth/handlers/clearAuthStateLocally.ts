import { authStore } from '@/features/auth/store/authStore';
import { clearSessionStorage } from '@/lib/storage/clearSessionStorage';
import { queryClient } from '@/react-query/queryClient';

/**
 * Full LOCAL sign-out: clears all in-memory auth connections/tokens/flags, persisted storage, and BOTH
 * React Query caches, WITHOUT posting a logout to CM or instances. None of it may survive into a
 * same-tab sign-in as another user, except the explorer's sign-out generation and the sign-in markers' migration flag
 * (see `authStore.wipeLocalStorageForSignOut`).
 */
export function clearAuthStateLocally(): void {
	runEvery([
		() => authStore.signOutAllLocally(),
		() => queryClient.getMutationCache().clear(),
		() => queryClient.getQueryCache().clear(),
		() => authStore.wipeLocalStorageForSignOut(),
		clearSessionStorage,
	]);
}

/**
 * Another account's session has replaced this tab's in the browser. Ends the previous account's instance sessions,
 * which the browser would otherwise present for the new account, and clears the rest locally. No CM logout: that
 * would end the new session.
 */
export async function clearPreviousAccount(): Promise<void> {
	const instanceLogouts = authStore.signOutFromPotentiallyAuthenticatedInstances();
	clearAuthStateLocally();
	await instanceLogouts.catch((error: unknown) =>
		console.debug("Could not end the previous account's instance sessions:", error)
	);
}

export function clearAuthStateAfterSignOutElsewhere(): void {
	runEvery([
		() => authStore.forgetAppSignInEndedElsewhere(),
		() => queryClient.getMutationCache().clear(),
		() => queryClient.getQueryCache().clear(),
		clearSessionStorage,
	]);
}

function runEvery(steps: Array<() => void>): void {
	for (const step of steps) {
		try {
			step();
		} catch (error) {
			// Not thrown: no caller can finish a half-done sign-out.
			console.error(error);
		}
	}
}
