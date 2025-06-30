import { useMutation } from '@tanstack/react-query';
import { instanceClient } from '@/config/instanceClient';
import { LocalUser } from '@/lib/api.patch';

export type InstanceLoginCredentials = {
	username: string;
	password: string;
};

export async function onInstanceLoginSubmit({
	username,
	password,
}: InstanceLoginCredentials): Promise<LocalUser> {
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
	return useMutation<LocalUser, Error, InstanceLoginCredentials>({
		mutationFn: (instanceData) => onInstanceLoginSubmit(instanceData),
	});
}
