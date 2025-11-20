import { InstanceClientConfig, InstanceClientIdConfig } from '@/config/instanceClientConfig';
import { LocalUser } from '@/integrations/api/api.patch';
import { queryOptions } from '@tanstack/react-query';

export function getListUsersQueryOptions({ entityId, instanceClient }: InstanceClientIdConfig) {
	return queryOptions({
		queryKey: [entityId, 'list_users'] as const,
		queryFn: () => getListUsers({ instanceClient }),
		refetchInterval: 10_000,
	});
}

async function getListUsers({ instanceClient }: InstanceClientConfig) {
	const { data } = await instanceClient.post('/', {
		operation: 'list_users',
	});
	return data as LocalUser[];
}
