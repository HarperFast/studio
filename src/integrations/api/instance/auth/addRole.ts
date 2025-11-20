import { InstanceClientConfig } from '@/config/instanceClientConfig';
import { useMutation } from '@tanstack/react-query';

export interface AddRoleFormData {
	role: string;
	super_user?: boolean;
	structure_user?: boolean;
}

export async function onAddRoleSubmit(formData: AddRoleFormData & InstanceClientConfig) {
	const { role, super_user, structure_user, instanceClient } = formData;
	const { data } = await instanceClient.post(
		'/',
		{
			operation: 'add_role',
			role,
			permission: {
				super_user,
				structure_user,
			},
		},
	);
	return data;
}

export function useAddRoleMutation() {
	return useMutation({
		mutationFn: onAddRoleSubmit,
	});
}
