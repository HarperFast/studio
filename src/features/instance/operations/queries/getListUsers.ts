import { instanceClient } from '@/config/instanceClient';
import { QueryClient, queryOptions } from '@tanstack/react-query';
import { LocalUser } from '@/lib/api.patch';

export function getListUsersQueryOptions(instanceId?: string) {
	return queryOptions({
		queryKey: [instanceId, 'list_users'] as const,
		queryFn: getListUsers,
		refetchInterval: 10 * 1000,
	});
}

export async function getListUsers() {
	const { data } = await instanceClient.post('/', {
		operation: 'list_users',
	});
	return data as LocalUser[];
}

export async function routeLoadUsers(queryClient: QueryClient, params: {
	instanceId?: string;
	userId?: string;
}) {
	return queryClient.ensureQueryData(getListUsersQueryOptions(params.instanceId));
}
