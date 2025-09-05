import { apiClient } from '@/config/apiClient';
import { useMutation } from '@tanstack/react-query';
import z from 'zod';

export const AddOrganizationRoleSchema = z.object({
	email: z
		.email({
			error: 'Please enter a valid email address',
		})
		.max(75, { error: 'Email must be less than 75 characters' }),
	roleId: z.string().min(1, { error: 'Please select a role' }),
});

export async function onAddUserToOrganizationRoleSubmit(formData: z.infer<typeof AddOrganizationRoleSchema>) {
	const { data } = await apiClient.post('/OrganizationRole/', formData);
	return data;
}

export function useAddUserToOrganizationRole() {
	return useMutation({
		mutationFn: (formData: z.infer<typeof AddOrganizationRoleSchema>) => onAddUserToOrganizationRoleSubmit(formData),
	});
}
