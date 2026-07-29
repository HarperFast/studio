import { apiClient } from '@/config/apiClient';
import { AdminLocation } from '@/integrations/api/api.patch';
import { queryOptions } from '@tanstack/react-query';

/**
 * GET /Location → every deployment location. Used to populate the region form's per-provider
 * location pickers so an admin can only pick values the Location table actually holds (the
 * RegionAdmin endpoint rejects unknown preferred locations with a 400).
 */
export async function getLocations(): Promise<AdminLocation[]> {
	const { data } = await apiClient.get('/Location/');
	return data as unknown as AdminLocation[];
}

export const locationsQueryKey = ['fabric-admin', 'locations'];

export function getLocationsQueryOptions() {
	return queryOptions({
		queryKey: locationsQueryKey,
		queryFn: getLocations,
		retry: false,
	});
}
