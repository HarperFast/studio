import { InstanceClientIdConfig } from '@/config/instanceClientConfig';
import { InstanceTable } from '@/integrations/api/api.patch';
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
		queryKey: [entityId, databaseName, tableName, 'describe_table'] as const,
		queryFn: async () => {
			const { data } = await instanceClient.post<InstanceTable>('/', {
				operation: 'describe_table',
				database: databaseName,
				table: tableName,
			});
			return data;
		},
		staleTime: 60_000,
		gcTime: 5_000,
		enabled: !!databaseName && !!tableName,
		retry: false,
	});
}
