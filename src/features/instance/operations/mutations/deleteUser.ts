import { InstanceClientConfig } from '@/config/instanceClientConfig';
import { useMutation } from '@tanstack/react-query';

interface DeleteUserData extends InstanceClientConfig {
	username: string;
}

interface DeleteUserResponse {
	message: string;
}

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
