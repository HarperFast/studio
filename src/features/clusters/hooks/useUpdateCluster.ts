import { apiClient } from '@/config/apiClient';
import { SchemaCluster, SchemaClusterUpsert } from '@/lib/api.gen';
import { useMutation } from '@tanstack/react-query';

async function onEditClusterSubmit(
	clusterInfo: Pick<SchemaCluster, 'id'> & Pick<SchemaClusterUpsert, 'regionPlans'>,
): Promise<SchemaCluster> {
	const { data } = await apiClient.put(
		`/Cluster/${clusterInfo.id}` as '/Cluster/{id}',
		{ regionPlans: clusterInfo.regionPlans },
		{ timeout: 0 },
	);
	return data;
}

export function useEditClusterMutation() {
	return useMutation<SchemaCluster, Error, Pick<SchemaCluster, 'id'> & Pick<SchemaClusterUpsert, 'regionPlans'>>({
		mutationFn: (clusterInfo) => onEditClusterSubmit(clusterInfo),
	});
}
