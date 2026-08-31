import { apiClient } from '@/config/apiClient';
import type { paths } from '@/integrations/api/api.gen';
import { ClusterUsage } from '@/integrations/api/cluster/getClusterUsage';
import { queryOptions } from '@tanstack/react-query';

/**
 * A fleet row: byte-identical to what `GET /Cluster/:id/usage` returns, plus the three cluster
 * fields needed to render it in a list. Same shape on purpose — one renderer serves both.
 */
export interface FleetUsageCluster extends ClusterUsage {
	organizationId: string;
	name: string;
	status: string | null;
}

export interface FleetUsageResult {
	clusters: FleetUsageCluster[];
	returned: number;
	/** Every cluster matching the filters, not just those returned. */
	matched?: number;
	truncated: boolean;
	limit: number;
	order: string;
}

/** The server's ceiling. Asking for all of it in one go, since the page shows the whole fleet. */
const FLEET_LIMIT = 1000;

/** Served by central-manager but absent from the generated spec, like the rest of Admin reporting. */
const USAGE_REPORTING = '/Admin/UsageReporting' as unknown as keyof paths;

/**
 * GET /Admin/UsageReporting → every cluster's usage in one request, rather than one per row.
 * Requires `billing:read`, which is stricter than the usage endpoint it wraps because these rows
 * carry invoice ids.
 *
 * Both orderings are computed, so central-manager costs every MATCHING cluster before cutting the
 * page — `limit` bounds the response, not the work. If this ever gets slow, the fix is to push the
 * page's filters into the query (organizationId, status) rather than raising the limit.
 */
export async function getFleetUsage(): Promise<FleetUsageResult> {
	const { data } = await apiClient.get(USAGE_REPORTING, { params: { limit: FLEET_LIMIT } });
	return data as unknown as FleetUsageResult;
}

export const fleetUsageQueryKey = ['fabric-admin', 'fleet-usage'];

export function getFleetUsageQueryOptions() {
	return queryOptions({
		queryKey: fleetUsageQueryKey,
		queryFn: getFleetUsage,
		retry: false,
		// Usage lags the instance-reporting cadence, so it doesn't need to be fresh to the second.
		staleTime: 60_000,
	});
}
