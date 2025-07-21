import { apiClient } from '@/config/apiClient';
import { useMutation } from '@tanstack/react-query';

export async function onDeleteOrganization(orgId: string) {
	const { data } = await apiClient.delete(`/Organization/${orgId}` as '/Organization/{id}');
	return data;
}

export function useDeleteOrganizationMutation() {
	return useMutation({
		mutationFn: (orgId: string) => onDeleteOrganization(orgId),
	});
}
