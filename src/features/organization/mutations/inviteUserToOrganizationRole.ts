import { apiClient } from '@/config/apiClient';
import { useMutation } from '@tanstack/react-query';
import z from 'zod';

export const InviteOrganizationRoleSchema = z.object({
	email: z
		.email({
			error: 'Please enter a valid email address',
		})
		.max(75, { error: 'Email must be less than 75 characters' }),
	roleId: z.string().min(1, { error: 'Please select a role' }),
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
