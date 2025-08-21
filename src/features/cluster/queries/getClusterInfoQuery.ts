import { apiClient } from '@/config/apiClient';
import { Cluster } from '@/lib/api.patch';
import { queryKeys } from '@/react-query/constants';
import { queryOptions } from '@tanstack/react-query';

export async function getClusterInfo(clusterId: string) {
	const { data } = await apiClient.get(`/Cluster/${clusterId}` as '/Cluster/{id}');
	return data as Cluster;
}

export function getClusterInfoQueryOptions(clusterId?: string, refetch?: boolean) {
	return queryOptions({
		queryKey: [queryKeys.cluster, clusterId],
		queryFn: () => getClusterInfo(clusterId!),
		retry: false,
		enabled: !!clusterId,
		refetchInterval: refetch ? 10000 : undefined,
	});
}
