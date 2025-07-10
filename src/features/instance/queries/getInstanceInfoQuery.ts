import { queryKeys } from '@/react-query/constants';
import { queryOptions } from '@tanstack/react-query';
import { isLocalStudio } from '@/config/constants';
import { instanceClient } from '@/config/instanceClient';
import { getClusterInfo } from '@/features/cluster/queries/getClusterInfoQuery';
import { getOperationsUrlForInstance } from '@/lib/urls/getOperationsUrlForInstance';
import { getOperationsUrlForCluster } from '@/lib/urls/getOperationsUrlForCluster';

async function getInstanceInfo(clusterId: string, instanceId?: string) {
	if (isLocalStudio) {
		return null;
	}
	const cluster = await getClusterInfo(clusterId);
	if (!cluster) {
		return null;
	}
	const instance = cluster.instances.find(instance => instanceId === undefined || instance.id === instanceId);
	if (!instance) {
		return null;
	}
	// Set the base URL for the instance client to the first FQDN of the instance
	// This allows all subsequent API calls to use the correct base URL for the instance
	if (instanceId === undefined) {
		instanceClient.defaults.baseURL = getOperationsUrlForCluster(cluster)!;
	} else {
		instanceClient.defaults.baseURL = getOperationsUrlForInstance(instance);
	}
	return { cluster, instance };
}

export function getInstanceInfoQueryOptions(clusterId: string, instanceId?: string) {
	return queryOptions({
		queryKey: [queryKeys.cluster, clusterId, queryKeys.instance, instanceId],
		queryFn: () => getInstanceInfo(clusterId, instanceId),
		retry: false,
	});
}
