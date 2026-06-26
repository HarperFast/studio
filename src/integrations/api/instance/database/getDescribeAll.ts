import { InstanceClientIdConfig } from '@/config/instanceClientConfig';
import { InstanceDatabaseMap } from '@/integrations/api/api.patch';
import { queryOptions } from '@tanstack/react-query';

interface GetDescribeAllParams extends InstanceClientIdConfig {
	/**
	 * Omit each table's `record_count` so the server skips the per-table count scan, which dominates
	 * describe latency on large databases. Off by default so callers that need counts (e.g. the AI
	 * tools) keep them; opt in where the count can be fetched separately/lazily.
	 */
	skipRecordCount?: boolean;
}

export async function getDescribeAll({ instanceClient, skipRecordCount }: GetDescribeAllParams) {
	const { data } = await instanceClient.post<InstanceDatabaseMap>('/', {
		operation: 'describe_all',
		// Ignored by servers that predate the flag, so this is safe to send unconditionally.
		skip_record_count: skipRecordCount || undefined,
	});
	return data;
}

export function getDescribeAllQueryOptions(params: GetDescribeAllParams) {
	return queryOptions({
		// Keyed by the flag so a count-skipping result never collides with a counted one.
		queryKey: [params.entityId, 'describe_all', !!params.skipRecordCount] as const,
		queryFn: () => getDescribeAll(params),
		staleTime: 60_000,
		gcTime: 5_000,
		retry: false,
	});
}
