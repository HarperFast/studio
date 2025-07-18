import { apiClient } from '@/config/apiClient';
import { ClusterDefinition } from '@/lib/api.patch';
import { useMutation } from '@tanstack/react-query';
import { SchemaCluster } from '@/lib/api.gen';

export async function onNewClusterSubmit(
	clusterInfo: ClusterDefinition,
): Promise<SchemaCluster> {
	const { data } = await apiClient.post('/Cluster/', clusterInfo);
	return data;
}

export function useCreateNewClusterMutation() {
	return useMutation<SchemaCluster, Error, ClusterDefinition>({
		mutationFn: (clusterInfo) => onNewClusterSubmit(clusterInfo),
	});
}
