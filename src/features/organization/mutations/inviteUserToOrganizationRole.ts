import { apiClient } from '@/config/apiClient';
import { zodRequireEmail } from '@/lib/zod/email';
import { useMutation } from '@tanstack/react-query';
import z from 'zod';

export const InviteOrganizationRoleSchema = z.object({
	email: zodRequireEmail
		.max(80, { error: 'Email cannot be longer than 80 characters.' }),
	roleId: z.string().nonempty({ error: 'Please select a role.' }),
});

export async function onInviteUserToOrganizationRoleSubmit(formData: z.infer<typeof InviteOrganizationRoleSchema>) {
	const { data } = await apiClient.post('/UserInvite/', formData);
	return data;
}

export function useInviteUserToOrganizationRole({ mutationKey }: { mutationKey?: readonly unknown[] } = {}) {
	return useMutation({
		mutationKey,
		mutationFn: (formData: z.infer<typeof InviteOrganizationRoleSchema>) =>
			onInviteUserToOrganizationRoleSubmit(formData),
	});
}
