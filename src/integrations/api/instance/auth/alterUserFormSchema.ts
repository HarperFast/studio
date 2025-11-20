import { AddUserFormSchema } from '@/integrations/api/instance/auth/addUserFormSchema';
import { z } from 'zod';

export const AlterUserFormSchema = z.object({
	username: AddUserFormSchema.shape.username,
	role: AddUserFormSchema.shape.role,
	newPassword: AddUserFormSchema.shape.password.or(z.undefined()).optional(),
	confirmPassword: AddUserFormSchema.shape.confirmPassword,
})
	.refine((data) => !data.newPassword || data.newPassword.length >= 8, {
		error: 'Password must be at least 8 characters long.',
		path: ['password'],
	})
	.refine((data) => !data.newPassword || data.newPassword === data.confirmPassword, {
		error: 'Passwords do not match.',
		path: ['confirmPassword'],
	});
