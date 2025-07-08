import { useMutation } from '@tanstack/react-query';
import { instanceClient } from '@/config/instanceClient';
import { signOutOnSuccess } from '@/features/auth/hooks/signOutOnSuccess';

type LogoutVariables = {
	instanceFqdn?: string;
}

type LogoutInfoResponse = {
	message: string;
};

export async function onInstanceLogoutSubmit(variables: LogoutVariables | void): Promise<LogoutInfoResponse> {
	const { data } = await instanceClient.post('/', {
		operation: 'logout',
	}, { baseURL: variables?.instanceFqdn });
	if (data) {
		return data;
	} else {
		throw new Error('Something went wrong');
	}
}

export function useInstanceLogoutMutation() {
	return useMutation<LogoutInfoResponse, Error, LogoutVariables | void>({
		mutationFn: (variables) => onInstanceLogoutSubmit(variables),
		onSuccess: signOutOnSuccess,
	});
}
