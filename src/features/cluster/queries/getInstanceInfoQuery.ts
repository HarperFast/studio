import { isLocalStudio } from '@/config/constants';
import { queryOptions } from '@tanstack/react-query';
import { getClusterInfo } from './getClusterInfoQuery';

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
		queryKey: [params.clusterId, params.instanceId] as const,
		queryFn: () => getInstanceInfo(params),
		enabled: !!params.clusterId && !!params.instanceId,
		retry: false,
	});
}
