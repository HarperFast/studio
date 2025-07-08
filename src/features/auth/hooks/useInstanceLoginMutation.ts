import { useMutation } from '@tanstack/react-query';
import { instanceClient } from '@/config/instanceClient';

export type InstanceLoginCredentials = {
	username: string;
	password: string;
	operationsUrl?: string;
};

type LoginInfoResponse = {
	message: string;
};

export async function onInstanceLoginSubmit({
	username,
	password,
	operationsUrl,
}: InstanceLoginCredentials): Promise<LoginInfoResponse> {
	const { data } = await instanceClient.post('/', {
		operation: 'login',
		username,
		password,
	}, { baseURL: operationsUrl });
	if (data) {
		return data;
	} else {
		throw new Error('Something went wrong');
	}
}

export function useInstanceLoginMutation() {
	return useMutation<LoginInfoResponse, Error, InstanceLoginCredentials>({
		mutationFn: (instanceData) => onInstanceLoginSubmit(instanceData),
	});
}
