import { apiClient } from '@/config/apiClient';
import { queryKeys } from '@/react-query/constants';

async function getRegionLocations() {
	const { data } = await apiClient.get(`/Region/`);
	return data;
}

function getRegionLocationsOptions() {
	return {
		queryKey: [queryKeys.cluster, 'regionLocations'],
		queryFn: getRegionLocations,
		retry: false,
	};
}

export { getRegionLocationsOptions };
