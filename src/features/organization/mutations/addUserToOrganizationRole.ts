import { apiClient } from '@/config/apiClient';
import { useMutation } from '@tanstack/react-query';
import z from 'zod';

export const AddOrganizationRoleSchema = z.object({
	email: z
		.string({
			message: 'Please enter a valid email address',
		})
		.max(75, { message: 'Email must be less than 75 characters' })
		.email({ message: 'Please enter a valid email address' }),
	roleId: z.string().min(1, { message: 'Please select a role' }),
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
