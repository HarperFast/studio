import { instanceClient } from '@/config/instanceClient';
import { InstanceSchemaMap } from '@/lib/api.patch';

import { queryOptions } from '@tanstack/react-query';

export function getDescribeAllQueryOptions(instanceId?: string) {
	return queryOptions({
		queryKey: [instanceId, 'describe_all'] as const,
		queryFn: async () => {
			const { data } = await instanceClient.post<InstanceSchemaMap>('/', {
				operation: 'describe_all',
			});
			return data;
		},
		retry: false,
	});
}
