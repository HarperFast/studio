import { apiClient } from '@/config/apiClient';
import { useMutation } from '@tanstack/react-query';

export async function onDeleteOrganizationRole({ roleId }: { roleId: string }) {
	const { data } = await apiClient.delete(`/Role/${roleId}` as '/Role/{id}', {
		// @ts-expect-error would love to figure this out
		id: roleId,
		deleted: true,
	});
	return data;
}

export function useDeleteOrganizationRole() {
	return useMutation<unknown, Error, { roleId: string }>({
		mutationFn: ({ roleId }: { roleId: string }) => onDeleteOrganizationRole({ roleId }),
	});
}
