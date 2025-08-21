import { InstanceClientIdConfig } from '@/config/instanceClientConfig';
import { InstanceTable } from '@/lib/api.patch';
import { queryOptions } from '@tanstack/react-query';

interface GetDescribeTableParams extends InstanceClientIdConfig {
	databaseName: string;
	tableName: string;
}

export function getDescribeTableQueryOptions({
	databaseName,
	tableName,
	entityId,
	instanceClient,
}: GetDescribeTableParams) {
	return queryOptions({
		queryKey: [entityId, 'describe_table', databaseName, tableName] as const,
		queryFn: async () => {
			const { data } = await instanceClient.post<InstanceTable>('/', {
				operation: 'describe_table',
				database: databaseName,
				table: tableName,
			});
			return data;
		},
		staleTime: 5000,
		enabled: !!databaseName && !!tableName,
		retry: false,
	});
}
