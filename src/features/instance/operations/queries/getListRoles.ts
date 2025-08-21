import { InstanceClientConfig, InstanceClientIdConfig } from '@/config/instanceClientConfig';
import { LocalRole } from '@/lib/api.patch';
import { queryOptions } from '@tanstack/react-query';

export function getListRolesQueryOptions({ entityId, instanceClient }: InstanceClientIdConfig) {
	return queryOptions({
		queryKey: [entityId, 'list_roles'] as const,
		queryFn: () => getListRoles({ instanceClient }),
		refetchInterval: 10_000,
	});
}

async function getListRoles({ instanceClient }: InstanceClientConfig) {
	const { data } = await instanceClient.post('/', {
		operation: 'list_roles',
	});
	return data as LocalRole[];
}
