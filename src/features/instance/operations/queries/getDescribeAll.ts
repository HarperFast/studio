import { instanceClient } from '@/config/instanceClient';
import { InstanceDatabaseMap } from '@/lib/api.patch';

import { queryOptions } from '@tanstack/react-query';

export function getDescribeAllQueryOptions(instanceOrClusterId?: string) {
	return queryOptions({
		queryKey: [instanceOrClusterId, 'describe_all'] as const,
		queryFn: async () => {
			const { data } = await instanceClient.post<InstanceDatabaseMap>('/', {
				operation: 'describe_all',
			});
			return data;
		},
		retry: false,
	});
}
