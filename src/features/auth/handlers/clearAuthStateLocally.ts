import { authStore } from '@/features/auth/store/authStore';
import { clearLocalStorage } from '@/lib/storage/clearLocalStorage';
import { clearSessionStorage } from '@/lib/storage/clearSessionStorage';
import { queryClient } from '@/react-query/queryClient';

/**
 * Full LOCAL sign-out for a session already known-dead (e.g. a 401 from CM):
 * clears all in-memory auth connections/tokens/flags, persisted storage, and
 * BOTH React Query caches — WITHOUT posting a logout to CM or instances (the
 * session is gone, so a network logout would only fail).
 *
 * This closes the cross-user gap where, after A's session expired, A's stale
 * in-memory entity connections / Fabric tokens / cached queries survived a
 * same-tab re-login as B. Clears the MutationCache too (logoutOnSuccess clears
 * only the QueryCache), so no credential lingers there either.
 */
export function clearAuthStateLocally(): void {
	authStore.signOutAllLocally();
	queryClient.getMutationCache().clear();
	queryClient.getQueryCache().clear();
	clearLocalStorage();
	clearSessionStorage();
}
