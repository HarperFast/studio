import { InstanceClientIdConfig } from '@/config/instanceClientConfig';
import { InstanceDatabaseMap } from '@/lib/api.patch';
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
		retry: false,
	});
}
