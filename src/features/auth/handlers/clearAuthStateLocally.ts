import { authStore } from '@/features/auth/store/authStore';
import { clearLocalStorage } from '@/lib/storage/clearLocalStorage';
import { clearSessionStorage } from '@/lib/storage/clearSessionStorage';
import { queryClient } from '@/react-query/queryClient';

/**
 * Full LOCAL sign-out: clears all in-memory auth connections/tokens/flags,
 * persisted storage, and BOTH React Query caches — WITHOUT posting a logout to
 * CM or instances. On its own for a session already known-dead (e.g. a 401
 * from CM, where a network logout would only fail); after the network logouts
 * for a user sign-out.
 *
 * This closes the cross-user gap where A's stale in-memory entity connections /
 * Fabric tokens / cached queries and mutations survived a same-tab re-login as B.
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
			// Reported, never thrown: the remaining steps must still run, and no caller can finish a
			// half-done sign-out for it.
			console.error(error);
		}
	}
}
