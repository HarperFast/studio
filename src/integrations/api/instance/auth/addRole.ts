import { InstanceClientConfig } from '@/config/instanceClientConfig';
import { LocalRole } from '@/integrations/api/api.patch';
import { useMutation } from '@tanstack/react-query';

export interface AddRoleFormData {
	role: string;
	super_user?: boolean;
	structure_user?: boolean;
}

export async function onAddRoleSubmit(formData: AddRoleFormData & InstanceClientConfig): Promise<LocalRole> {
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
	// add_role echoes back the created role, including its unique `id`, which we use to navigate
	// to the new role for editing (role names are not unique, so the name can't identify it).
	return data as LocalRole;
}

export function useAddRoleMutation() {
	return useMutation({
		mutationFn: onAddRoleSubmit,
	});
}
