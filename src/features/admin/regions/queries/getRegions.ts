import { apiClient } from '@/config/apiClient';
import { AdminRegion } from '@/integrations/api/api.patch';
import { queryOptions } from '@tanstack/react-query';

/**
 * GET /Admin/Region → every region (super-user only).
 *
 * The response is cast: the generated schema predates the `active` flag and types `organizationIds`
 * as non-nullable, while the API returns null for a public region.
 */
export async function getRegions(): Promise<AdminRegion[]> {
	// Trailing slash is required: GET /Admin/Region (no slash) returns Harper's collection
	// descriptor, /Admin/Region/ returns the records array.
	const { data } = await apiClient.get('/Admin/Region/');
	return data as unknown as AdminRegion[];
}

export const regionsQueryKey = ['fabric-admin', 'regions'];

export function getRegionsQueryOptions() {
	return queryOptions({
		queryKey: regionsQueryKey,
		queryFn: getRegions,
		retry: false,
	});
}
