import { apiClient } from '@/config/apiClient';
import { SchemaCluster } from '@/integrations/api/api.gen';
import { ClusterUpsert } from '@/integrations/api/api.patch';
import { useMutation } from '@tanstack/react-query';

type EditRegionPlan = Pick<SchemaCluster, 'id'> & Pick<ClusterUpsert, 'regionPlans' | 'skipGtmWait'>;
type EditVersion = Pick<SchemaCluster, 'id'> & Pick<ClusterUpsert, 'version' | 'skipGtmWait'>;

async function onEditClusterSubmit(
	clusterInfo: EditRegionPlan | EditVersion,
): Promise<SchemaCluster> {
	const { id, ...changes } = clusterInfo;
	const { data } = await apiClient.put(
		`/Cluster/${id}` as '/Cluster/{id}',
		changes,
		{ timeout: 0 },
	);
	return data;
}

export function useEditClusterMutation() {
	return useMutation<SchemaCluster, Error, EditRegionPlan | EditVersion>({
		mutationFn: (clusterInfo) => onEditClusterSubmit(clusterInfo),
	});
}
