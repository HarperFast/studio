import { authStore } from '@/features/auth/store/authStore';
import { clearLocalStorage } from '@/lib/storage/clearLocalStorage';
import { clearSessionStorage } from '@/lib/storage/clearSessionStorage';
import { queryClient } from '@/react-query/queryClient';

/**
 * Full LOCAL sign-out: clears all in-memory auth connections/tokens/flags, persisted storage, and BOTH
 * React Query caches, WITHOUT posting a logout to CM or instances. None of it may survive into a
 * same-tab sign-in as another user.
 */
export function clearAuthStateLocally(): void {
	runEvery([
		() => authStore.signOutAllLocally(),
		() => queryClient.getMutationCache().clear(),
		() => queryClient.getQueryCache().clear(),
		clearLocalStorage,
		clearSessionStorage,
	]);
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
