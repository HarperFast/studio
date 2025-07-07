import { useMutation } from '@tanstack/react-query';
import { instanceClient } from '@/config/instanceClient';
import { InstanceLoginResponse } from '@/features/instance/operations/mutations/readInstanceLogin';

export type InstanceLoginCredentials = {
	username: string;
	password: string;
};

// TODO: Combine with onInstanceLoginSubmit
export async function onInstanceLoginSubmit({
	username,
	password,
}: InstanceLoginCredentials): Promise<InstanceLoginResponse> {
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

export function useLocalSignIn() {
	return useMutation<InstanceLoginResponse, Error, InstanceLoginCredentials>({
		mutationFn: (instanceData) => onInstanceLoginSubmit(instanceData),
	});
}
