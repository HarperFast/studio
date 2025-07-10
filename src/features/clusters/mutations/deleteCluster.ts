import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/config/apiClient';

const onDeleteCluster = async (clusterId: string) => {
	const { data } = await apiClient.delete(`/Cluster/${clusterId}` as '/Cluster/{id}');
	return data;
};

const useDeleteClusterMutation = () => {
	return useMutation({
		mutationFn: (clusterId: string) => onDeleteCluster(clusterId),
	});
};

export { useDeleteClusterMutation };
