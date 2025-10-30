import { apiClient } from '@/config/apiClient';

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
	return {
		queryKey: [organizationId, 'regionLocations', availableHosts],
		queryFn: () => getRegionLocations({ organizationId, availableHosts }),
		retry: false,
	};
}
