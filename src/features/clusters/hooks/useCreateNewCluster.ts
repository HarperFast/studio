import { apiClient } from '@/config/apiClient';
import { SchemaCluster } from '@/integrations/api/api.gen';
import { ClusterUpsert } from '@/integrations/api/api.patch';
import { useMutation } from '@tanstack/react-query';

async function onNewClusterSubmit(
	clusterInfo: ClusterUpsert,
): Promise<SchemaCluster> {
	const { data } = await apiClient.post(
		'/Cluster/',
		clusterInfo,
		{ timeout: 0 },
	);
	return data;
}

export function useCreateNewClusterMutation() {
	return useMutation<SchemaCluster, Error, ClusterUpsert>({
		mutationFn: (clusterInfo) => onNewClusterSubmit(clusterInfo),
	});
}
