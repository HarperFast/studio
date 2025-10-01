import { apiClient } from '@/config/apiClient';
import { useMutation } from '@tanstack/react-query';

async function onTerminateCluster(clusterId: string) {
	const { data } = await apiClient.delete(`/Cluster/${clusterId}` as '/Cluster/{id}', { timeout: 120_000 },);
	return data;
}

export function useTerminateClusterMutation() {
	return useMutation({
		mutationFn: (clusterId: string) => onTerminateCluster(clusterId),
	});
}
