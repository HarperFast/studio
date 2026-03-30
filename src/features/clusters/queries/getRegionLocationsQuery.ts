import { apiClient } from '@/config/apiClient';
import { queryOptions } from '@tanstack/react-query';

export interface GetRegionLocationsParams {
	organizationId?: string;
	availableHosts?: boolean;
}

async function getRegionLocations({ organizationId, availableHosts }: GetRegionLocationsParams = {}) {
	const { data } = await apiClient.get(`/Region/`, {
		params: {
			availableHosts,
			organizationId,
		},
	});
	return data;
}

export function getRegionLocationsOptions({ organizationId, availableHosts }: GetRegionLocationsParams = {}) {
	return queryOptions({
		queryKey: [organizationId, 'regionLocations', availableHosts],
		queryFn: () => getRegionLocations({ organizationId, availableHosts }),
		retry: false,
	});
}
