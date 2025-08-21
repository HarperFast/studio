import { InstanceClientConfig } from '@/config/instanceClientConfig';
import { useMutation } from '@tanstack/react-query';

interface DeleteRoleData extends InstanceClientConfig {
	id: string;
}

interface DeleteRoleResponse {
	message: string;
}

async function onDeleteRole({ id, instanceClient }: DeleteRoleData) {
	const { data } = await instanceClient.post<DeleteRoleResponse>('/', {
		operation: 'drop_role',
		id,
	});
	return data;
}

export function useDeleteRoleMutation() {
	return useMutation({
		mutationFn: onDeleteRole,
	});
}
