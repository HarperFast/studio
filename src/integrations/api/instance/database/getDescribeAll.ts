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
	/**
	 * Also list `@computed` attributes (flagged `computed: true`), which describe omits by default.
	 * Opt-in: a caller has to treat them as read-only, as browse does.
	 */
	includeComputed?: boolean;
}

export async function getDescribeAll({ instanceClient, skipRecordCount, includeComputed }: GetDescribeAllParams) {
	const { data } = await instanceClient.post<InstanceDatabaseMap>('/', {
		operation: 'describe_all',
		// When we don't need counts, ask the server to skip them entirely. Pair it with `exact_count: false`
		// so an older server that doesn't understand `skip_record_count` still takes its cheap (time-bounded)
		// estimate path rather than a full exact scan. Both keys are ignored by servers that predate them, so
		// this is safe: newer servers don't count at all, older ones at least never count exactly.
		skip_record_count: skipRecordCount || undefined,
		exact_count: skipRecordCount ? false : undefined,
		include_computed: includeComputed || undefined,
	});
	return data;
}

export function getDescribeAllQueryOptions(params: GetDescribeAllParams) {
	return queryOptions({
		// Keyed by the flags so results asked for differently never collide.
		queryKey: [params.entityId, 'describe_all', !!params.skipRecordCount, !!params.includeComputed] as const,
		queryFn: () => getDescribeAll(params),
		staleTime: 60_000,
		gcTime: 5_000,
		retry: false,
	});
}
