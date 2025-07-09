import { apiClient } from '@/config/apiClient';
import { queryKeys } from '@/react-query/constants';
import { queryOptions } from '@tanstack/react-query';
import { Cluster } from '@/lib/api.patch';

async function getClusterInfo(context: { queryKey: (string | undefined)[] }) {
	const { data } = await apiClient.get(`/Cluster/${context.queryKey[1]}` as '/Cluster/{id}');
	return data as unknown as Cluster;
}

function getClusterInfoQueryOptions(clusterId?: string) {
	return queryOptions({
		queryKey: [queryKeys.cluster, clusterId],
		queryFn: getClusterInfo,
		retry: false,
		enabled: !!clusterId,
	});
}

export { getClusterInfoQueryOptions };
