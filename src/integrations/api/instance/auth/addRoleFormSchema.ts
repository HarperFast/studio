import { z } from 'zod';

export const AddRoleFormSchema = z.object({
	role: z
		.string()
		.nonempty({ error: 'Please enter a role.' })
		.regex(/^[a-zA-Z_]*$/, {
			error: 'Role must contain only letters and underscores.',
		})
		.max(30, {
			error: 'Role cannot be longer than 30 characters.',
		}),
	super_user: z.boolean(),
	structure_user: z.boolean(),
});
