import { zodRequireUsername } from '@/lib/zod/username';
import { z } from 'zod';

export const DeleteUserFormSchema = z.object({
	username: zodRequireUsername,
	confirmUsernameForDeletion: z
		.string()
		.nonempty({
			error: 'Please type the username again to confirm deletion.',
		})
		.toLowerCase(),
})
	.refine((data) => data.username === data.confirmUsernameForDeletion, {
		error: 'Username does not match.',
		path: ['confirmUsernameForDeletion'], // This specifies where the error message should be attached
	});
