import { apiClient } from '@/config/apiClient';
import { useMutation } from '@tanstack/react-query';
import { SchemaCluster } from '@/lib/api.gen';

export async function onNewClusterSubmit(
	clusterInfo: Omit<SchemaCluster, 'id'>,
): Promise<SchemaCluster> {
	const { data } = await apiClient.post('/Cluster/', clusterInfo);
	return data;
}

export function useCreateNewClusterMutation() {
	return useMutation<SchemaCluster, Error, Omit<SchemaCluster, 'id'>>({
		mutationFn: (clusterInfo) => onNewClusterSubmit(clusterInfo),
	});
}
