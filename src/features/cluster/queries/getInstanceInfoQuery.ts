import { isLocalStudio } from '@/config/constants';
import { getClusterInfo } from '@/features/cluster/queries/getClusterInfoQuery';
import { queryKeys } from '@/react-query/constants';
import { queryOptions } from '@tanstack/react-query';

interface GetInstanceInfoParams {
	clusterId?: string;
	instanceId?: string;
}

async function getInstanceInfo({ clusterId, instanceId }: GetInstanceInfoParams) {
	if (isLocalStudio) {
		return null;
	}
	if (!clusterId) {
		throw new Error('clusterId is required when outside of local mode and calling getInstanceInfo');
	}
	const cluster = await getClusterInfo(clusterId);
	if (!cluster) {
		return null;
	}
	const instance = cluster.instances?.find(instance => instanceId === undefined || instance.id === instanceId);
	if (!instance) {
		return null;
	}
	return { cluster, instance };
}

export function getInstanceInfoQueryOptions(params: GetInstanceInfoParams) {
	return queryOptions({
		queryKey: [queryKeys.cluster, params.clusterId, queryKeys.instance, params.instanceId] as const,
		queryFn: () => getInstanceInfo(params),
		retry: false,
	});
}
