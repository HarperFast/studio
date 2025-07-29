import { apiClient } from '@/config/apiClient';
import { useMutation } from '@tanstack/react-query';

export async function onRemoveUserFromOrganizationRole({ roleId, userId }: { roleId: string; userId: string; }) {
	// TODO: The API doesn't describe this endpoint in its docs.
	const { data } = await apiClient.delete(`/OrganizationRole/role/${roleId}/user/${userId}` as '/OrganizationRole/{id}');
	return data;
}

export function useRemoveUserFromOrganizationRole() {
	return useMutation<unknown, Error, { roleId: string; userId: string; }>({
		mutationFn: ({ roleId, userId }: {
			roleId: string;
			userId: string;
		}) => onRemoveUserFromOrganizationRole({ roleId, userId }),
	});
}
