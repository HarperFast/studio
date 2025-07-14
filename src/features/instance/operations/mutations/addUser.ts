import { useMutation } from '@tanstack/react-query';
import { instanceClient } from '@/config/instanceClient';
import { z } from 'zod';

export type AddUserFormData = {
	active: boolean;
	password: string;
	role: string;
	username: string;
};

export const AddUserFormSchema = z.object({
	username: z.string({
		message: 'Please enter a username.',
		// TODO: usernames must have only letters, numbers, hyphens, and underscores
	}).min(1, { message: 'Please enter a username.' }),
	role: z.string({
		message: 'Please select a role.',
	}),
	password: z
		.string({
			message: 'Please enter a password.',
		})
		// TODO: Verify restrictions
		.min(8, { message: 'Password must be 8 characters or more.' })
		.max(50, { message: 'Password must be less than 50 characters.' }),
	confirmPassword: z
		.string({
			message: 'Please enter the password again.',
		})
		// TODO: Verify restrictions
		.min(8, { message: 'Password must be 8 characters or more.' })
		.max(50, { message: 'Password must be less than 50 characters.' }),
})
	.refine((data) => data.password === data.confirmPassword, {
		message: 'Passwords do not match',
		path: ['confirmPassword'], // This specifies where the error message should be attached
	});

const onAddUserSubmit = async (formData: AddUserFormData) => {
	const { data } = await instanceClient.post('/', {
		operation: 'add_user',
		...formData,
	});
	return data;
};

export const useAddUserMutation = () => {
	return useMutation({
		mutationFn: (formData: AddUserFormData) => onAddUserSubmit(formData),
	});
};
