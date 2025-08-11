import { instanceClient } from '@/config/instanceClient';
import { InstanceTable } from '@/lib/api.patch';

import { queryOptions } from '@tanstack/react-query';

export function getDescribeTableQueryOptions({
	instanceOrClusterId,
	schemaName,
	tableName,
}: {
	instanceOrClusterId: string;
	schemaName: string;
	tableName: string;
}) {
	return queryOptions({
		queryKey: [instanceOrClusterId, schemaName, tableName, 'describe_table'] as const,
		queryFn: async () => {
			const { data } = await instanceClient.post<InstanceTable>('/', {
				operation: 'describe_table',
				schema: schemaName,
				table: tableName,
			});
			return data;
		},
		staleTime: 5000,
		enabled: !!instanceOrClusterId && !!schemaName && !!tableName,
		retry: false,
	});
}
