import { z } from 'zod';

export const DeleteUserFormSchema = z.object({
	username: z
		.string()
		.nonempty({
			error: 'Please enter a username.',
		}),
	confirmUsernameForDeletion: z
		.string()
		.nonempty({
			error: 'Please type the username again to confirm deletion.',
		}),
})
	.refine((data) => data.username === data.confirmUsernameForDeletion, {
		error: 'Username does not match.',
		path: ['confirmUsernameForDeletion'], // This specifies where the error message should be attached
	});
