import apiClient from '@/config/apiClient';
import { useMutation } from '@tanstack/react-query';

export type NewClusterInfo = {
	clusterName: string;
	organizationId: string;
	abbreviatedName: string;
};

type NewClusterInfoResponse = {
	id: string;
	name: string;
	organizationId: string;
	tag: string;
};

export const onNewClusterSubmit = async ({
	clusterName,
	organizationId,
	abbreviatedName,
}: NewClusterInfo): Promise<NewClusterInfoResponse> => {
	const { data } = await apiClient.post('/Cluster', {
		name: clusterName,
		abbreviatedName,
		organizationId,
	});
	if (data) {
		return data as NewClusterInfoResponse;
	} else {
		throw new Error('Something went wrong');
	}
};

export function useCreateNewClusterMutation() {
	return useMutation<NewClusterInfoResponse, Error, NewClusterInfo>({
		mutationFn: (clusterInfo) => onNewClusterSubmit(clusterInfo),
	});
}
