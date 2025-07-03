import { apiClient } from '@/config/apiClient';
import { useMutation } from '@tanstack/react-query';
import { SchemaCluster } from '@/lib/api.gen';

type NewClusterInfoResponse = {
	id: string;
	name: string;
	organizationId: string;
	tag: string;
};

export async function onNewClusterSubmit(
	clusterInfo: SchemaCluster
): Promise<NewClusterInfoResponse> {
	// TODO: Work through any disagreements between the SchemaCluster and our local types here.
	const { data } = await apiClient.post('/Cluster/', clusterInfo);
	if (data) {
		return data as never as NewClusterInfoResponse;
	} else {
		throw new Error('Something went wrong');
	}
}

export function useCreateNewClusterMutation() {
	return useMutation<NewClusterInfoResponse, Error, SchemaCluster>({
		mutationFn: (clusterInfo) => onNewClusterSubmit(clusterInfo),
	});
}
