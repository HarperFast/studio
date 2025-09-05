import { InstanceClientConfig } from '@/config/instanceClientConfig';
import { useMutation } from '@tanstack/react-query';
import { z } from 'zod';

export interface AddRoleFormData {
	role: string;
	super_user?: boolean;
	structure_user?: boolean;
}

export const AddRoleFormSchema = z.object({
	role: z
		.string({
			error: 'Please enter a role.',
		})
		.min(1, { error: 'Please enter a role.' })
		.regex(/^[a-zA-Z_]+$/, {
			error: 'Role must contain only letters and underscores.',
		})
		.max(30, {
			error: 'Role must be less than 30 characters.',
		}),
	super_user: z.boolean(),
	structure_user: z.boolean(),
});

export async function onAddRoleSubmit(formData: AddRoleFormData & InstanceClientConfig) {
	const { role, super_user, structure_user, instanceClient } = formData;
	const { data } = await instanceClient.post(
		'/',
		{
			operation: 'add_role',
			role,
			permission: {
				super_user,
				structure_user,
			},
		},
	);
	return data;
}

export function useAddRoleMutation() {
	return useMutation({
		mutationFn: onAddRoleSubmit,
	});
}
