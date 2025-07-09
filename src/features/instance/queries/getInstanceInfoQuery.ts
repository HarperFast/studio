import { apiClient } from '@/config/apiClient';
import { queryKeys } from '@/react-query/constants';
import { queryOptions } from '@tanstack/react-query';
import { isLocalStudio } from '@/config/constants';
import { instanceClient } from '@/config/instanceClient';
import { Instance } from '@/lib/api.patch';

const getInstanceInfo = async (instanceId: string) => {
	if (isLocalStudio) {
		return null;
	}
	// TODO: Work through any disagreements between the SchemaInstanceType and our local types here.
	const { data } = await apiClient.get(`/HDBInstance/${instanceId}` as '/HDBInstance/{id}');
	if (data) {
		// Set the base URL for the instance client to the first FQDN of the instance
		// This allows all subsequent API calls to use the correct base URL for the instance
		instanceClient.defaults.baseURL = data.instanceFqdn;
	}
	return data as unknown as Instance;
};

function getInstanceInfoQueryOptions(instanceId: string) {
	return queryOptions({
		queryKey: [queryKeys.instance, instanceId],
		queryFn: () => getInstanceInfo(instanceId),
		retry: false,
	});
}

export { getInstanceInfoQueryOptions };
