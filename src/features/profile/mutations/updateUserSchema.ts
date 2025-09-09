import { z } from 'zod';

export const UpdateUserSchema = z
	.object({
		id: z.string(),
		email: z
			.email({
				error: 'Please enter a valid email address.',
			})
			.max(75, { error: 'Email must be less than 75 characters.' }),
		firstname: z
			.string({
				error: 'Please enter your first name.',
			})
			.min(2, { error: 'First name is required.' })
			.max(50, { error: 'First name must be less than 50 characters.' }),
		lastname: z
			.string({
				error: 'Please enter your last name.',
			})
			.min(2, { error: 'Last name is required.' })
			.max(50, { error: 'Last name must be less than 50 characters.' }),
		newPassword: z
			.string({
				error: 'Please enter your new password.',
			})
			.min(8, { error: 'Password must be 8 characters or more.' })
			.or(z.string().max(0)),
		confirmNewPassword: z
			.string()
			.optional(),
	})
	.refine((data) => data.newPassword === data.confirmNewPassword, {
		error: 'Passwords do not match',
		path: ['confirmNewPassword'],
	});
