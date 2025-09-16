import { apiClient } from '@/config/apiClient';
import { zodRequireEmail } from '@/lib/zod/email';
import { useMutation } from '@tanstack/react-query';
import z from 'zod';

export const AddOrganizationRoleSchema = z.object({
	email: zodRequireEmail
		.max(80, { error: 'Email cannot be longer than 80 characters.' }),
	roleId: z.string().nonempty({ error: 'Please select a role.' }),
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
