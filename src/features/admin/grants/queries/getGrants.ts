import { apiClient } from '@/config/apiClient';
import type { paths } from '@/integrations/api/api.gen';
import { AdminClusterGrant } from '@/integrations/api/api.patch';
import { queryOptions } from '@tanstack/react-query';

/** Served by central-manager but not yet in the generated spec; shapes declared in api.patch.d.ts. */
const GRANT_REPORTING_PATH = '/Admin/GrantReporting' as unknown as keyof paths;

export interface GrantReportingFilters {
	source?: string;
	status?: string;
}

export interface GrantReportingResult {
	grants: AdminClusterGrant[];
	returned: number;
	/**
	 * Every row matching the filters, not just those returned. Lets the page name the shortfall
	 * exactly when the server capped the result. Optional so the page still renders honestly against
	 * a central-manager that predates the field.
	 */
	matched?: number;
	/**
	 * True when the server hit its row limit before draining the table. The UI must say so: a
	 * silently-capped list reads as "nothing else is due", which on a billing view is the worst
	 * possible lie.
	 */
	truncated: boolean;
	limit: number;
}

/**
 * GET /Admin/GrantReporting → grant rows in the per-id admin shape — full row, staff fields,
 * plus server-computed `isActive` and `timeline`. Requires `grant:read`.
 *
 * The billing view lists grants rather than clusters on purpose: the grant is the billing object,
 * and an unbound voucher has no cluster to list under at all. Source/status narrow server-side so
 * the page stops fetching the world at fleet scale; free text stays client-side.
 */
export async function getGrants(filters: GrantReportingFilters): Promise<GrantReportingResult> {
	const params: Record<string, string> = {};
	if (filters.source) { params.source = filters.source; }
	if (filters.status) { params.status = filters.status; }
	const { data } = await apiClient.get(GRANT_REPORTING_PATH, { params });
	return data as unknown as GrantReportingResult;
}

export const grantsQueryKey = ['fabric-admin', 'grants'];

export function getGrantsQueryOptions(filters: GrantReportingFilters = {}) {
	return queryOptions({
		queryKey: [...grantsQueryKey, filters.source ?? '', filters.status ?? ''],
		queryFn: () => getGrants(filters),
		retry: false,
	});
}
