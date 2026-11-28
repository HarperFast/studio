import { apiClient } from '@/config/apiClient';
import { clearPreviousAccount } from '@/features/auth/handlers/clearAuthStateLocally';
// Circular with authStore.ts (it calls fetchCurrentUser); safe because neither
// module touches the other's exports at module-evaluation time.
import { authStore, OverallAppSignIn } from '@/features/auth/store/authStore';
import { User } from '@/integrations/api/api.patch';
import { queryOptions } from '@tanstack/react-query';

/** The signed-in user, without syncing it into the auth store: the store's own check applies it itself. */
export async function fetchCurrentUser({ timeout }: { timeout?: number } = {}): Promise<User> {
	const { data } = await apiClient.get(
		'/User/current' as '/User/{id}',
		timeout === undefined ? undefined : { timeout },
	);
	// TODO: The roles the API returns is a map instead of an array, so we have to map through unknown.
	return data as unknown as User;
}

export async function getCurrentUser(options: { timeout?: number } = {}): Promise<User> {
	const signOutGeneration = authStore.getSignOutGeneration(OverallAppSignIn);
	const signInRevision = authStore.getSignInRevision(OverallAppSignIn);
	const user = await fetchCurrentUser(options);
	// The /Login/ response seeds the auth store with a slimmer user than
	// /User/current returns (it lacks fabricRole, among other fields), so sync
	// the authoritative record into the store whenever we fetch it — unless a
	// sign-out landed while it was in flight, or a sign-in its answer may
	// predate. Resolved, not rejected, then: a rejection would reach the
	// query's global error toast.
	if (
		authStore.getSignOutGeneration(OverallAppSignIn) === signOutGeneration
		&& authStore.getSignInRevision(OverallAppSignIn) === signInRevision
	) {
		const held = authStore.getHeldAppUser();
		// The browser's session is another account's now (a verify here, or a sign-in in another tab). Cleared in the
		// same tick as the sync, so nothing sees this tab signed out in between.
		if (held !== null && held !== user.id) {
			void clearPreviousAccount();
		}
		authStore.syncAppUser(user);
	}
	return user;
}

export const currentUserQueryKey = ['current-user'];

export function getCurrentUserQueryOptions() {
	return queryOptions({
		queryKey: currentUserQueryKey,
		queryFn: () => getCurrentUser(),
		retry: false,
	});
}
