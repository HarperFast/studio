import { apiClient } from '@/config/apiClient';
import { SchemaRole } from '@/lib/api.gen';
import { useMutation } from '@tanstack/react-query';
import z from 'zod';

export const AddOrganizationRoleSchema = z.object({
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

export async function onAddOrganizationRoleSubmit(formData: SchemaRole) {
	const { data } = await apiClient.post('/Role/', formData);
	return data;
}

export function useAddOrganizationRole() {
	return useMutation({
		mutationFn: (formData: SchemaRole) => onAddOrganizationRoleSubmit(formData),
	});
}
