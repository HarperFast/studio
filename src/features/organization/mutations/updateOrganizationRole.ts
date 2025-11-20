import { apiClient } from '@/config/apiClient';
import { SchemaRole } from '@/integrations/api/api.gen';
import { useMutation } from '@tanstack/react-query';
import z from 'zod';

export const UpdateOrganizationRoleSchema = z.object({
	roleName: z
		.string()
		.nonempty({
			error: 'Please enter a role name.',
		})
		.regex(/^[a-zA-Z_]*$/, {
			error: 'Role must contain only letters and underscores.',
		})
		.max(30, { error: 'Role name cannot be longer than 30 characters.' }),
	updateOrganization: z.boolean(),
	deleteOrganization: z.boolean(),
});

export async function onUpdateOrganizationRole({
	roleId,
	updatedRoleInfo,
}: {
	roleId: string;
	updatedRoleInfo: SchemaRole;
}) {
	const { data } = await apiClient.put(`/Role/${roleId}` as '/Role/{id}', updatedRoleInfo);
	return data as SchemaRole;
}

export function useUpdateOrganizationRole() {
	return useMutation<SchemaRole, Error, { roleId: string; updatedRoleInfo: SchemaRole }>({
		mutationFn: ({ roleId, updatedRoleInfo }: { roleId: string; updatedRoleInfo: SchemaRole }) =>
			onUpdateOrganizationRole({ roleId, updatedRoleInfo }),
	});
}
