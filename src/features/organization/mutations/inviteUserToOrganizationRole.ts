import { apiClient } from '@/config/apiClient';
import { useMutation } from '@tanstack/react-query';
import z from 'zod';

export const InviteOrganizationRoleSchema = z.object({
	email: z
		.string({
			message: 'Please enter a valid email address',
		})
		.max(75, { message: 'Email must be less than 75 characters' })
		.email({ message: 'Please enter a valid email address' }),
	roleId: z.string().min(1, { message: 'Please select a role' }),
});

export async function onInviteUserToOrganizationRoleSubmit(formData: z.infer<typeof InviteOrganizationRoleSchema>) {
	const { data } = await apiClient.post('/UserInvite/', formData);
	return data;
}

export function useInviteUserToOrganizationRole() {
	return useMutation({
		mutationFn: (formData: z.infer<typeof InviteOrganizationRoleSchema>) => onInviteUserToOrganizationRoleSubmit(formData),
	});
}
