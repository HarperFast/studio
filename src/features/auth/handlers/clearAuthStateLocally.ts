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
	for (
		const step of [
			() => authStore.signOutAllLocally(),
			() => queryClient.getMutationCache().clear(),
			() => queryClient.getQueryCache().clear(),
			clearLocalStorage,
			clearSessionStorage,
		]
	) {
		try {
			step();
		} catch (error) {
			// Not thrown: no caller can finish a half-done sign-out.
			console.error(error);
		}
	}
}
