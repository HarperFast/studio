import { apiClient } from '@/config/apiClient';
import { SchemaRole } from '@/lib/api.gen';
import { useMutation } from '@tanstack/react-query';
import z from 'zod';

export const AddOrganizationRoleSchema = z.object({
	email: z
		.string({
			message: 'Please enter a valid email address',
		})
		.max(75, { message: 'Email must be less than 75 characters' })
		.email({ message: 'Please enter a valid email address' }),
	roleId: z.string(),
});

export async function onAddUserToOrganizationRoleSubmit(formData: SchemaRole) {
	const { data } = await apiClient.post('/OrganizationRole/', formData);
	return data;
}

export function useAddUserToOrganizationRole() {
	return useMutation({
		mutationFn: (formData: SchemaRole) => onAddUserToOrganizationRoleSubmit(formData),
	});
}
