import { useMutation } from '@tanstack/react-query';
import { instanceClient } from '@/config/instanceClient';

type LogoutInfoResponse = {
	message: string;
};

export async function onInstanceLogoutSubmit(): Promise<LogoutInfoResponse> {
	const { data } = await instanceClient.post('/', {
		operation: 'logout',
	});
	if (data) {
		return data;
	} else {
		throw new Error('Something went wrong');
	}
}

export function useLocalSignOutMutation() {
	return useMutation<LogoutInfoResponse, Error>({
		mutationFn: () => onInstanceLogoutSubmit(),
	});
}
