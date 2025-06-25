import { apiClient } from '@/config/apiClient';
import { queryKeys } from '@/react-query/constants';
import { SchemaLocation } from '@/lib/api.gen';

// TODO: Work through any disagreements between the SchemaLocation and our local types here.
interface RegionLocation extends SchemaLocation {
	id: string;
	region: string;
	cloudProvider: 'linode' | 'aws' | 'gcp' | 'azure' | 'self-hosted' | 'none';
	location: string;
}

type RegionLocations = RegionLocation[];

async function getRegionLocations(): Promise<RegionLocations> {
	const { data } = await apiClient.get(`/Region`);
	// TODO: The OpenAPI specs don't describe arrays correctly.
	return data as RegionLocations;
}

function getRegionLocationsOptions() {
	return {
		queryKey: [queryKeys.cluster, 'regionLocations'],
		queryFn: getRegionLocations,
		retry: false,
	};
}

export { getRegionLocationsOptions };
export type { RegionLocations };
