import { apiClient } from '@/config/apiClient';
import { useMutation } from '@tanstack/react-query';
import { SchemaCluster, SchemaClusterUpsert } from '@/lib/api.gen';

export async function onNewClusterSubmit(
	clusterInfo: SchemaClusterUpsert,
): Promise<SchemaCluster> {
	const { data } = await apiClient.post('/Cluster/', clusterInfo);
	return data;
}

export function useCreateNewClusterMutation() {
	return useMutation<SchemaCluster, Error, SchemaClusterUpsert>({
		mutationFn: (clusterInfo) => onNewClusterSubmit(clusterInfo),
	});
}
