import { InstanceClientConfig } from '@/config/instanceClientConfig';
import { useMutation } from '@tanstack/react-query';
import { z } from 'zod';

interface DeleteUserData extends InstanceClientConfig {
	username: string;
}

interface DeleteUserResponse {
	message: string;
}

export const DeleteUserFormSchema = z.object({
	username: z.string({
		error: 'Please enter a username.',
		// TODO: usernames must have only letters, numbers, hyphens, and underscores
	}).min(1, { error: 'Please enter a username.' }),
	confirmUsernameForDeletion: z.string({
		error: 'Please type the username again to confirm deletion.',
		// TODO: usernames must have only letters, numbers, hyphens, and underscores
	}).min(1, { error: 'Please confirm the username to delete.' }),
})
	.refine((data) => data.username === data.confirmUsernameForDeletion, {
		error: 'Username does not match',
		path: ['confirmUsernameForDeletion'], // This specifies where the error message should be attached
	});

export async function onDeleteUser({ username, instanceClient }: DeleteUserData) {
	const { data } = await instanceClient.post<DeleteUserResponse>('/', {
		operation: 'drop_user',
		username,
	});
	return data;
}

export function useDeleteUserMutation() {
	return useMutation({
		mutationFn: onDeleteUser,
	});
}
