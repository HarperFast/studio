import { apiClient } from '@/config/apiClient';
import { OrganizationRegion } from '@/integrations/api/api.patch';
import { queryOptions } from '@tanstack/react-query';
import { isAxiosError } from 'axios';

/**
 * GET /OrganizationRegion/?organizationId= → the organization's custom regions (members and staff).
 * A central-manager that predates the resource answers 404; that reads as "none", so a catalog-only
 * cluster form keeps working across the rollout.
 */
export async function getOrganizationRegions(organizationId: string): Promise<OrganizationRegion[]> {
	try {
		const { data } = await apiClient.get(
			`/OrganizationRegion/?organizationId=${encodeURIComponent(organizationId)}` as '/Region/',
		);
		return data as unknown as OrganizationRegion[];
	} catch (error) {
		if (isAxiosError(error) && error.response?.status === 404) {
			return [];
		}
		throw error;
	}
}

export async function getOrganizationRegion(id: string): Promise<OrganizationRegion> {
	const { data } = await apiClient.get(`/OrganizationRegion/${encodeURIComponent(id)}` as '/Region/{id}');
	return data as unknown as OrganizationRegion;
}

export const organizationRegionsQueryKey = (organizationId: string) => ['organizationRegions', organizationId];
export const organizationRegionQueryKey = (id: string) => ['organizationRegion', id];

export function getOrganizationRegionsQueryOptions(organizationId: string | undefined) {
	return queryOptions({
		queryKey: organizationRegionsQueryKey(organizationId ?? ''),
		queryFn: () => getOrganizationRegions(organizationId!),
		enabled: !!organizationId,
		retry: false,
	});
}

export function getOrganizationRegionQueryOptions(id: string | undefined) {
	return queryOptions({
		queryKey: organizationRegionQueryKey(id ?? ''),
		queryFn: () => getOrganizationRegion(id!),
		enabled: !!id,
		retry: false,
	});
}
