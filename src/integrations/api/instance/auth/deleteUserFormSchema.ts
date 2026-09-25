import { zodRequireUsername } from '@/lib/zod/username';
import { z } from 'zod';

export const DeleteUserFormSchema = z.object({
	username: zodRequireUsername,
	confirmUsernameForDeletion: z
		.string()
		.nonempty({
			error: 'Please type the username again to confirm deletion.',
		}),
})
	// Harper usernames can hold capitals (HDB_ADMIN), so fold both sides rather than just the typed one.
	.refine((data) => data.username.toLowerCase() === data.confirmUsernameForDeletion.toLowerCase(), {
		error: 'Username does not match.',
		path: ['confirmUsernameForDeletion'], // This specifies where the error message should be attached
	});
