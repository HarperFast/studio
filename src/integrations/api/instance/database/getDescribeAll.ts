import { InstanceClientIdConfig } from '@/config/instanceClientConfig';
import { InstanceDatabaseMap } from '@/integrations/api/api.patch';
import { queryOptions } from '@tanstack/react-query';

export function getDescribeAllQueryOptions({ entityId, instanceClient }: InstanceClientIdConfig) {
	return queryOptions({
		queryKey: [entityId, 'describe_all'] as const,
		queryFn: async () => {
			const { data } = await instanceClient.post<InstanceDatabaseMap>('/', {
				operation: 'describe_all',
			});
			return data;
		},
		staleTime: 60_000,
		gcTime: 5_000,
		retry: false,
	});
}
