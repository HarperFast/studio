import { useMutation } from '@tanstack/react-query';
import { instanceClient } from '@/config/instanceClient';
import { z } from 'zod';

export type AddRoleFormData = {
	role: string;
	super_user?: boolean;
	structure_user?: boolean;
	operationsUrl?: string;
};

export const AddRoleFormSchema = z.object({
	role: z
		.string({
			message: 'Please enter a role.',
		})
		.min(1, { message: 'Please enter a role.' })
		.regex(/^[a-zA-Z_]+$/, {
			message: 'Role must contain only letters and underscores.',
		})
		.max(30, {
			message: 'Role must be less than 30 characters.',
		}),
	super_user: z.boolean(),
	structure_user: z.boolean(),
});

export async function onAddRoleSubmit(formData: AddRoleFormData) {
	const { operationsUrl, role, super_user, structure_user } = formData;
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
		{ baseURL: operationsUrl }
	);
	return data;
}

export function useAddRoleMutation() {
	return useMutation({
		mutationFn: (formData: AddRoleFormData) => onAddRoleSubmit(formData),
	});
}
