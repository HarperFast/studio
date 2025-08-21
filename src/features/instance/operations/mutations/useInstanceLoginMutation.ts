import { InstanceClientConfig } from '@/config/instanceClientConfig';
import { useMutation } from '@tanstack/react-query';

interface InstanceLoginCredentials extends InstanceClientConfig {
	username: string;
	password: string;
}

export interface LoginInfoResponse {
	message: string;
}

export async function onInstanceLoginSubmit({
	username,
	password,
	instanceClient,
}: InstanceLoginCredentials): Promise<LoginInfoResponse> {
	const { data } = await instanceClient.post('/', {
		operation: 'login',
		username,
		password,
	});
	if (data) {
		return data;
	} else {
		throw new Error('Something went wrong');
	}
}

export function useInstanceLoginMutation() {
	return useMutation<LoginInfoResponse, Error, InstanceLoginCredentials>({
		mutationFn: onInstanceLoginSubmit,
	});
}
