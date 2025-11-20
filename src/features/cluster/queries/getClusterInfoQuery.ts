import { apiClient } from '@/config/apiClient';
import { Cluster } from '@/integrations/api/api.patch';
import { queryOptions } from '@tanstack/react-query';

export async function getClusterInfo(clusterId: string) {
	const { data } = await apiClient.get(`/Cluster/${clusterId}` as '/Cluster/{id}');
	return data as Cluster;
}

export function getClusterInfoQueryOptions(clusterId?: string | false, refetch?: boolean | number) {
	return queryOptions({
		queryKey: [clusterId],
		queryFn: () => getClusterInfo(clusterId as string),
		retry: false,
		enabled: !!clusterId,
		refetchInterval: refetch
			? refetch === true
				? 10000
				: refetch
			: undefined,
	});
}
