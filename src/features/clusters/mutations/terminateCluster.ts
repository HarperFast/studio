import { apiClient } from '@/config/apiClient';
import { useMutation } from '@tanstack/react-query';

async function onTerminateCluster(clusterId: string) {
	const { data } = await apiClient.delete(`/Cluster/${clusterId}` as '/Cluster/{id}');
	return data;
}

export function useTerminateClusterMutation() {
	return useMutation({
		mutationFn: (clusterId: string) => onTerminateCluster(clusterId),
	});
}
