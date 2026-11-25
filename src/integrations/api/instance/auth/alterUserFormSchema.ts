import { AddUserFormSchema } from '@/integrations/api/instance/auth/addUserFormSchema';
import { z } from 'zod';

const AlterUserFields = z.object({
	username: AddUserFormSchema.shape.username,
	role: AddUserFormSchema.shape.role,
	newPassword: AddUserFormSchema.shape.password.or(z.literal('')).optional(),
	confirmPassword: AddUserFormSchema.shape.confirmPassword,
	active: z.boolean(),
});

function withPasswordChecks<T extends z.ZodType<{ newPassword?: string; confirmPassword: string }>>(fields: T) {
	return fields
		.refine((data) => !data.newPassword || data.newPassword.length >= 8, {
			error: 'Password must be at least 8 characters long.',
			path: ['password'],
		})
		.refine((data) => !data.newPassword || data.newPassword === data.confirmPassword, {
			error: 'Passwords do not match.',
			path: ['confirmPassword'],
		});
}

export const AlterUserFormSchema = withPasswordChecks(AlterUserFields);

/** For an editor who can't list roles: the role is shown but never sent, so a user whose role is gone can still be saved. */
export const AlterUserFixedRoleFormSchema = withPasswordChecks(AlterUserFields.extend({ role: z.string() }));
