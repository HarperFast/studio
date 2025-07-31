import { useMutation } from '@tanstack/react-query';
import { instanceClient } from '@/config/instanceClient';
import { logoutOnSuccess } from '@/features/auth/handlers/logoutOnSuccess';

type LogoutVariables = {
	operationsUrl?: string;
}

type LogoutInfoResponse = {
	message: string;
};

export async function onInstanceLogoutSubmit(variables: LogoutVariables | void): Promise<LogoutInfoResponse> {
	const { data } = await instanceClient.post('/', {
		operation: 'logout',
	}, { baseURL: variables?.operationsUrl });
	if (data) {
		return data;
	} else {
		throw new Error('Something went wrong');
	}
}

export function useInstanceLogoutMutation() {
	return useMutation<LogoutInfoResponse, Error, LogoutVariables | void>({
		mutationFn: (variables) => onInstanceLogoutSubmit(variables),
		onSuccess: logoutOnSuccess,
	});
}
