import { useMutation } from '@tanstack/react-query';
import { instanceClient } from '@/config/instanceClient';
import { z } from 'zod';

type DeleteUserData = {
	username: string;
};

type DeleteUserResponse = {
	message: string;
}

export const DeleteUserFormSchema = z.object({
	username: z.string({
		message: 'Please enter a username.',
		// TODO: usernames must have only letters, numbers, hyphens, and underscores
	}).min(1, { message: 'Please enter a username.' }),
	confirmUsernameForDeletion: z.string({
		message: 'Please type the username again to confirm deletion.',
		// TODO: usernames must have only letters, numbers, hyphens, and underscores
	}).min(1, { message: 'Please confirm the username to delete.' }),
})
	.refine((data) => data.username === data.confirmUsernameForDeletion, {
		message: 'Username does not match',
		path: ['confirmUsernameForDeletion'], // This specifies where the error message should be attached
	});

const onDeleteUser = async (userData: DeleteUserData) => {
	const { data } = await instanceClient.post<DeleteUserResponse>('/', {
		operation: 'drop_user',
		username: userData.username,
	});
	return data;
};

const useDeleteUserMutation = () => {
	return useMutation({
		mutationFn: (data: DeleteUserData) => onDeleteUser(data),
	});
};

export { useDeleteUserMutation };
export type { DeleteUserData };
