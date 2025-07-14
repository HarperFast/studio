import { instanceClient } from '@/config/instanceClient';
import { QueryClient, queryOptions } from '@tanstack/react-query';
import { LocalRole } from '@/lib/api.patch';

export function getListRolesQueryOptions(instanceId?: string) {
	return queryOptions({
		queryKey: [instanceId, 'list_roles'] as const,
		queryFn: getListRoles,
		refetchInterval: 10 * 1000,
	});
}

export async function getListRoles() {
	const { data } = await instanceClient.post('/', {
		operation: 'list_roles',
	});
	return data as LocalRole[];
}

export async function routeLoadRoles(queryClient: QueryClient, params: {
	instanceId?: string;
	userId?: string;
}) {
	return queryClient.ensureQueryData(getListRolesQueryOptions(params.instanceId));
}
