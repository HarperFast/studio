import { instanceClient } from '@/config/instanceClient';
import { InstanceSchemaMap } from '@/lib/api.patch';

import { queryOptions } from '@tanstack/react-query';

export function getDescribeAllQueryOptions(instanceOrClusterId?: string) {
	return queryOptions({
		queryKey: [instanceOrClusterId, 'describe_all'] as const,
		queryFn: async () => {
			const { data } = await instanceClient.post<InstanceSchemaMap>('/', {
				operation: 'describe_all',
			});
			return data;
		},
		retry: false,
	});
}
