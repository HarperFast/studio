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
		// ClusterForm shows the failure beside its submit button, so the fading toast is off. Reported
		// here rather than in the form's `onError`, which React Query skips once the form unmounts.
		meta: { skipGlobalErrorToast: true },
		onError: (error) => console.error(error),
	});
}
