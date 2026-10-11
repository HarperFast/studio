import { z } from 'zod';

export const UpdateUserSchema = z
	.object({
		id: z.string(),
		firstname: z
			.string({
				error: 'Please enter your first name.',
			})
			.min(2, { error: 'First name is required.' })
			.max(40, { error: 'First name cannot be longer than 40 characters.' }),
		lastname: z
			.string({
				error: 'Please enter your last name.',
			})
			.min(2, { error: 'Last name is required.' })
			.max(80, { error: 'Last name cannot be longer than 80 characters.' }),
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
	.superRefine((data, ctx) => {
		if (data.newPassword !== data.confirmNewPassword) {
			ctx.addIssue({
				code: 'custom',
				path: ['confirmNewPassword'],
				message: data.confirmNewPassword ? 'Passwords do not match' : 'Please confirm your new password.',
			});
		}
	});
