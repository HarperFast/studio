import { z } from 'zod';

export const AddUserFormSchema = z
	.object({
		username: z
			.string()
			.trim()
			.toLowerCase()
			.nonempty({ error: 'Please enter a username.' }),
		role: z
			.string()
			.nonempty({
				error: 'Please select a role.',
			}),
		password: z
			.string()
			.min(8, { error: 'Password must be at least 8 characters long.' }),
		confirmPassword: z.string(),
	})
	.refine((data) => data.password === data.confirmPassword, {
		error: 'Passwords do not match.',
		path: ['confirmPassword'],
	});
