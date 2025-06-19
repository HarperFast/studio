import apiClient from '@/config/apiClient';
import { useMutation } from '@tanstack/react-query';

// TODO: Consolidate with useOnSignUpSubmitMutation
export type InstanceLoginCredentials = {
	username: string;
	password: string;
};

type RegistrationInfoResponse = {
	message: string;
};

export const onInstanceLoginSubmit = async ({
	username,
	password,
}: InstanceLoginCredentials): Promise<RegistrationInfoResponse> => {
	// TODO: The OpenAPI specs don't describe this route.
	const { data } = await apiClient.post('/' as never, {
		operation: 'login',
		username,
		password,
	});
	if (data) {
		return data;
	} else {
		throw new Error('Something went wrong');
	}
};

export function useLocalSignIn() {
	return useMutation<RegistrationInfoResponse, Error, InstanceLoginCredentials>({
		mutationFn: (instanceData) => onInstanceLoginSubmit(instanceData),
	});
}
