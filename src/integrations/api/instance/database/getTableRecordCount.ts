import { InstanceClientIdConfig } from '@/config/instanceClientConfig';
import { InstanceTable } from '@/integrations/api/api.patch';
import { queryOptions } from '@tanstack/react-query';

interface GetTableRecordCountParams extends InstanceClientIdConfig {
	enabled: boolean;
	databaseName: string;
	tableName: string;
}

/**
 * Fetches an *exact* record count via `describe_table` with `exact_count: true`. This forces the server
 * to scan the whole primary store with no time budget, so it can be slow on large tables -- it is meant
 * to run only on explicit user request (the cheap estimate from a plain describe is the default). The
 * timeout is disabled so a long count isn't cut off.
 */
export async function getTableRecordCount(
	{ databaseName, tableName, instanceClient }: Omit<GetTableRecordCountParams, 'enabled'>,
) {
	const { data } = await instanceClient.post<InstanceTable>(
		'/',
		{
			operation: 'describe_table',
			database: databaseName,
			table: tableName,
			exact_count: true,
		},
		{ timeout: 0 },
	);
	return data.record_count;
}

export function getTableRecordCountQueryOptions(params: GetTableRecordCountParams) {
	return queryOptions({
		enabled: params.enabled && !!params.databaseName && !!params.tableName,
		queryKey: [params.entityId, params.databaseName, params.tableName, 'record_count', 'exact'] as const,
		queryFn: () => getTableRecordCount(params),
		staleTime: 60_000,
		gcTime: 5_000,
		retry: false,
	});
}
