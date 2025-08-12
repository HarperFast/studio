import { instanceClient } from '@/config/instanceClient';
import { InstanceTable } from '@/lib/api.patch';

import { queryOptions } from '@tanstack/react-query';

export function getDescribeTableQueryOptions({
	instanceOrClusterId,
	databaseName,
	tableName,
}: {
	instanceOrClusterId: string;
	databaseName: string;
	tableName: string;
}) {
	return queryOptions({
		queryKey: [instanceOrClusterId, databaseName, tableName, 'describe_table'] as const,
		queryFn: async () => {
			const { data } = await instanceClient.post<InstanceTable>('/', {
				operation: 'describe_table',
				database: databaseName,
				table: tableName,
			});
			return data;
		},
		staleTime: 5000,
		enabled: !!instanceOrClusterId && !!databaseName && !!tableName,
		retry: false,
	});
}
