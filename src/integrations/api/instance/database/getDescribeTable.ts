import { InstanceClientIdConfig } from '@/config/instanceClientConfig';
import { InstanceTable } from '@/integrations/api/api.patch';
import { queryOptions } from '@tanstack/react-query';

interface GetDescribeTableParams extends InstanceClientIdConfig {
	databaseName: string;
	tableName: string;
}

export async function getDescribeTable({ databaseName, tableName, instanceClient }: GetDescribeTableParams) {
	const { data } = await instanceClient.post<InstanceTable>('/', {
		operation: 'describe_table',
		database: databaseName,
		table: tableName,
	});
	return data;
}

export function getDescribeTableQueryOptions(params: GetDescribeTableParams) {
	return queryOptions({
		queryKey: [params.entityId, params.databaseName, params.tableName, 'describe_table'] as const,
		queryFn: () => getDescribeTable(params),
		staleTime: 60_000,
		gcTime: 5_000,
		enabled: !!params.databaseName && !!params.tableName,
		retry: false,
	});
}
