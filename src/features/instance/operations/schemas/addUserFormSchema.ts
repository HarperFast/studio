import { zodRequirePassword } from '@/lib/zod/password';
import { zodRequireUsername } from '@/lib/zod/username';
import { z } from 'zod';

export const AddUserFormSchema = z
	.object({
		username: zodRequireUsername,
		role: z
			.string()
			.nonempty({
				error: 'Please select a role.',
			}),
		password: zodRequirePassword
			.min(8, { error: 'Password must be at least 8 characters long.' }),
		confirmPassword: z.string(),
	})
	.refine((data) => data.password === data.confirmPassword, {
		error: 'Passwords do not match.',
		path: ['confirmPassword'], // This specifies where the error message should be attached
	});
