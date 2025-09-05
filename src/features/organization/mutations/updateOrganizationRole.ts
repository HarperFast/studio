import { apiClient } from '@/config/apiClient';
import { useMutation } from '@tanstack/react-query';
import z from 'zod';
import { SchemaRole } from '@/lib/api.gen';

export const UpdateOrganizationRoleSchema = z.object({
	roleName: z
		.string({
			error: 'Please enter a role name.',
		})
		.min(1, { error: 'Role name must be at least 1 character.' })
		.regex(/^[a-zA-Z_]+$/, {
			error: 'Role must contain only letters and underscores.',
		})
		.max(30, { error: 'Role name must be less than 30 characters.' }),
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
