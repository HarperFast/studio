import { apiClient } from '@/config/apiClient';
import { useMutation } from '@tanstack/react-query';
import z from 'zod';
import { GetOrganizationRoleInfoResponse } from '../../queries/getOrganizationRoleInfo';

export const UpdateOrganizationRoleSchema = z.object({
	roleName: z
		.string({
			message: 'Please enter a role name.',
		})
		.min(1, { message: 'Role name must be at least 1 character.' })
		.regex(/^[a-zA-Z_]+$/, {
			message: 'Role must contain only letters and underscores.',
		})
		.max(30, { message: 'Role name must be less than 30 characters.' }),
	updateOrganization: z.boolean(),
	deleteOrganization: z.boolean(),
});

export async function onUpdateOrganizationRole({
	roleId,
	updatedRoleInfo,
}: {
	roleId: string;
	updatedRoleInfo: GetOrganizationRoleInfoResponse;
}) {
	const { data } = await apiClient.put(`/Role/${roleId}` as '/Role/{id}', updatedRoleInfo);
	return data as GetOrganizationRoleInfoResponse;
}

export function useUpdateOrganizationRole() {
	return useMutation<
		GetOrganizationRoleInfoResponse,
		Error,
		{ roleId: string; updatedRoleInfo: GetOrganizationRoleInfoResponse }
	>({
		mutationFn: ({ roleId, updatedRoleInfo }: { roleId: string; updatedRoleInfo: GetOrganizationRoleInfoResponse }) =>
			onUpdateOrganizationRole({ roleId, updatedRoleInfo }),
	});
}
