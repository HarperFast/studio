import { InstanceClientIdConfig } from '@/config/instanceClientConfig';
import { InstanceDatabaseMap } from '@/integrations/api/api.patch';
import { queryOptions } from '@tanstack/react-query';

export async function getDescribeAll({ instanceClient }: InstanceClientIdConfig) {
	const { data } = await instanceClient.post<InstanceDatabaseMap>('/', {
		operation: 'describe_all',
	});
	return data;
}

export function getDescribeAllQueryOptions(params: InstanceClientIdConfig) {
	return queryOptions({
		queryKey: [params.entityId, 'describe_all'] as const,
		queryFn: () => getDescribeAll(params),
		staleTime: 60_000,
		gcTime: 5_000,
		retry: false,
	});
}
