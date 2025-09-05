import { InstanceClientConfig } from '@/config/instanceClientConfig';
import { useMutation } from '@tanstack/react-query';
import { z } from 'zod';

interface AddUserFormData extends InstanceClientConfig {
	active: boolean;
	password: string;
	role: string;
	username: string;
}

export const AddUserFormSchema = z.object({
	username: z.string({
		error: 'Please enter a username.',
		// TODO: usernames must have only letters, numbers, hyphens, and underscores
	}).min(1, { error: 'Please enter a username.' }),
	role: z.string({
		error: 'Please select a role.',
	}),
	password: z
		.string({
			error: 'Please enter a password.',
		})
		// TODO: Verify restrictions
		.min(8, { error: 'Password must be 8 characters or more.' })
		.max(50, { error: 'Password must be less than 50 characters.' }),
	confirmPassword: z
		.string({
			error: 'Please enter the password again.',
		}),
})
	.refine((data) => data.password === data.confirmPassword, {
		error: 'Passwords do not match',
		path: ['confirmPassword'], // This specifies where the error message should be attached
	});

export async function onAddUserSubmit(formData: AddUserFormData) {
	const { instanceClient, ...userData } = formData;
	const { data } = await instanceClient.post('/', {
		operation: 'add_user',
		...userData,
	});
	return data;
}

export function useAddUserMutation() {
	return useMutation({
		mutationFn: onAddUserSubmit,
	});
}
