import { apiClient } from '@/config/apiClient';
import type { paths } from '@/integrations/api/api.gen';
import { AdminClusterGrant } from '@/integrations/api/api.patch';
import { queryOptions } from '@tanstack/react-query';

/**
 * Served by central-manager but absent from the generated spec — its /openapi document omits
 * several Admin resources — so the path is cast and the row shape lives in api.patch.d.ts.
 */
const GRANTS_PATH = '/Admin/ClusterGrant/' as unknown as keyof paths;

/**
 * GET /Admin/ClusterGrant/ → every grant row, staff fields included. Requires `grant:read`.
 *
 * The billing view lists grants rather than clusters on purpose: the grant is the billing object —
 * it says why a cluster may run, on what terms, and where in its expiry timeline it sits. Unbound
 * vouchers (clusterId null) have no cluster to list under at all.
 */
export async function getGrants(): Promise<AdminClusterGrant[]> {
	const { data } = await apiClient.get(GRANTS_PATH);
	return data as unknown as AdminClusterGrant[];
}

export const grantsQueryKey = ['fabric-admin', 'grants'];

export function getGrantsQueryOptions() {
	return queryOptions({
		queryKey: grantsQueryKey,
		queryFn: getGrants,
		retry: false,
	});
}
