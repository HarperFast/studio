import { apiClient } from '@/config/apiClient';
import { useMutation } from '@tanstack/react-query';

type DeleteInstanceResponse = {
	id: string;
	deleted: boolean;
};

const onDeleteInstanceSubmit = async (instanceId: string): Promise<DeleteInstanceResponse> => {
	// TODO: The OpenAPI response types aren't very descriptive.
	const { data } = await apiClient.delete(`/HDBInstance/${instanceId}` as '/HDBInstance/{id}');
	if (data) {
		return data as DeleteInstanceResponse;
	} else {
		throw new Error('Something went wrong');
	}
};

export function useDeleteInstance() {
	return useMutation({
		mutationFn: (instanceId: string) => onDeleteInstanceSubmit(instanceId),
	});
}
