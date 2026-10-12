import { InstanceClientConfig } from '@/config/instanceClientConfig';
import { LocalRole, LocalRolePermission } from '@/integrations/api/api.patch';
import { useMutation } from '@tanstack/react-query';

export interface AddRoleFormData {
	role: string;
}

interface AddRoleRequest extends AddRoleFormData, InstanceClientConfig {
	permission: LocalRolePermission;
}

export async function onAddRoleSubmit({ role, permission, instanceClient }: AddRoleRequest): Promise<LocalRole> {
	const { data } = await instanceClient.post(
		'/',
		{
			operation: 'add_role',
			role,
			permission,
		},
	);
	return data as LocalRole;
}

export function useAddRoleMutation() {
	return useMutation({
		mutationFn: onAddRoleSubmit,
	});
}
