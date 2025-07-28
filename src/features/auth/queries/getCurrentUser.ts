import { User } from '@/lib/api.patch';
import { apiClient } from '@/config/apiClient';
import { queryKeys } from '@/react-query/constants';
import { queryOptions } from '@tanstack/react-query';

export async function getCurrentUser(): Promise<User> {
	const { data } = await apiClient.get('/User/current' as '/User/{id}');
	// TODO: The roles the API returns is a map instead of an array, so we have to map through unknown.
	return data as unknown as User;
}

export function getCurrentUserQueryOptions() {
	return queryOptions({
		queryKey: [queryKeys.user],
		queryFn: getCurrentUser,
		retry: false,
	});
}
