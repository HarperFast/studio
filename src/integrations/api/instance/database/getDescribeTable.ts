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
		// Take the cheap (time-bounded) estimate path for the count. We intentionally keep the count here --
		// it drives the "~N records" estimate shown immediately in pagination -- rather than skipping it; the
		// exact count is a separate, on-demand fetch. `exact_count: false` is the default on current servers,
		// so this is mainly an explicit guard against any server that would otherwise count exactly.
		exact_count: false,
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
