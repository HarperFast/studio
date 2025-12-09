import { apiClient } from '@/config/apiClient';
import { useMutation } from '@tanstack/react-query';

export async function terminateCluster(clusterId: string) {
	const { data } = await apiClient.delete(`/Cluster/${clusterId}` as '/Cluster/{id}', { timeout: 0 });
	return data;
}

export function useTerminateClusterMutation() {
	return useMutation({
		mutationFn: (clusterId: string) => terminateCluster(clusterId),
	});
}
