import { useMutation } from '@tanstack/react-query';
import { instanceClient } from '@/config/instanceClient';

export type DeleteRoleData = {
	id: string;
	operationsUrl?: string;
};

export type DeleteRoleResponse = {
	message: string;
};

export async function onDeleteRole({ id, operationsUrl }: DeleteRoleData) {
	const { data } = await instanceClient.post<DeleteRoleResponse>(
		'/',
		{
			operation: 'drop_role',
			id,
		},
		{ baseURL: operationsUrl }
	);
	return data;
}

export function useDeleteRoleMutation() {
	return useMutation({
		mutationFn: (data: DeleteRoleData) => onDeleteRole(data),
	});
}
