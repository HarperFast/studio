import { apiClient } from '@/config/apiClient';
import { SchemaCluster, SchemaClusterUpsert } from '@/integrations/api/api.gen';
import { useMutation } from '@tanstack/react-query';

async function onNewClusterSubmit(
	clusterInfo: SchemaClusterUpsert,
): Promise<SchemaCluster> {
	const { data } = await apiClient.post(
		'/Cluster/',
		clusterInfo,
		{ timeout: 0 },
	);
	return data;
}

export function useCreateNewClusterMutation() {
	return useMutation<SchemaCluster, Error, SchemaClusterUpsert>({
		mutationFn: (clusterInfo) => onNewClusterSubmit(clusterInfo),
	});
}
