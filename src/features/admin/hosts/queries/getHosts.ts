import { apiClient } from '@/config/apiClient';
import { AdminHost, HostStatus } from '@/integrations/api/api.patch';
import { queryOptions } from '@tanstack/react-query';

export const ALL_STATUSES = 'all';
export type HostStatusFilter = HostStatus | typeof ALL_STATUSES;

export interface AdminHostFilters {
	status: HostStatusFilter;
	organizationId?: string;
	cloudProvider?: string;
	locationId?: string;
	region?: string;
}

const OPTIONAL_FILTERS = ['organizationId', 'cloudProvider', 'locationId', 'region'] as const;

/** Unset filters are left out entirely: the endpoint answers a blank value with a 400. */
export function hostsQueryString(filters: AdminHostFilters): string {
	const params = new URLSearchParams({ status: filters.status });
	for (const key of OPTIONAL_FILTERS) {
		const value = filters[key];
		if (value) { params.set(key, value); }
	}
	return params.toString();
}

/**
 * GET /Admin/Host/ → the hosts matching `filters` (host:read). Not in the generated OpenAPI types
 * yet, so the path and the response are cast.
 */
export async function getHosts(filters: AdminHostFilters): Promise<AdminHost[]> {
	const { data } = await apiClient.get(`/Admin/Host/?${hostsQueryString(filters)}` as '/Admin/Region/');
	return data as unknown as AdminHost[];
}

const hostsQueryKey = ['fabric-admin', 'hosts'];

export function getHostsQueryOptions(filters: AdminHostFilters) {
	return queryOptions({
		queryKey: [...hostsQueryKey, filters],
		queryFn: () => getHosts(filters),
		retry: false,
	});
}
