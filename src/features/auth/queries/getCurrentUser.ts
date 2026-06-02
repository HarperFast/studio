import { apiClient } from '@/config/apiClient';
// Circular with authStore.ts (it calls getCurrentUser); safe because neither
// module touches the other's exports at module-evaluation time.
import { authStore, OverallAppSignIn } from '@/features/auth/store/authStore';
import { User } from '@/integrations/api/api.patch';
import { queryOptions } from '@tanstack/react-query';

export async function getCurrentUser(): Promise<User> {
	const { data } = await apiClient.get('/User/current' as '/User/{id}');
	// TODO: The roles the API returns is a map instead of an array, so we have to map through unknown.
	const user = data as unknown as User;
	// The /Login/ response seeds the auth store with a slimmer user than
	// /User/current returns (it lacks fabricRole, among other fields), so sync
	// the authoritative record into the store whenever we fetch it.
	authStore.setUserForEntity(OverallAppSignIn, user);
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
