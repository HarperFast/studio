import { apiClient } from '@/config/apiClient';
// Circular with authStore.ts (it calls fetchCurrentUser); safe because neither
// module touches the other's exports at module-evaluation time.
import { authStore, OverallAppSignIn } from '@/features/auth/store/authStore';
import { User } from '@/integrations/api/api.patch';
import { queryOptions } from '@tanstack/react-query';

/** The signed-in user, without syncing it into the auth store: the store's own check applies it itself. */
export async function fetchCurrentUser(): Promise<User> {
	const { data } = await apiClient.get('/User/current' as '/User/{id}');
	// TODO: The roles the API returns is a map instead of an array, so we have to map through unknown.
	return data as unknown as User;
}

export async function getCurrentUser(): Promise<User> {
	const signOutGeneration = authStore.getSignOutGeneration(OverallAppSignIn);
	const signInRevision = authStore.getSignInRevision(OverallAppSignIn);
	const user = await fetchCurrentUser();
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
		authStore.syncAppUser(user);
	}
	return user;
}

export const currentUserQueryKey = ['current-user'];

export function getCurrentUserQueryOptions() {
	return queryOptions({
		queryKey: currentUserQueryKey,
		queryFn: getCurrentUser,
		retry: false,
	});
}
