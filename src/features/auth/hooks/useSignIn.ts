import { apiClient } from '@/config/apiClient';
import { useMutation } from '@tanstack/react-query';

// TODO: Consolidate with useOnSignUpSubmitMutation
export type SignInCredentials = {
	email: string;
	password: string;
};

type SignInResponse = {
	id: string;
	email: string;
	firstname: string;
	lastname: string;
};

export async function onLoginSubmit({ email, password }: SignInCredentials): Promise<SignInResponse> {
	// TODO: The OpenAPI request body for this endpoint isn't defined.
	const { data } = await apiClient.post('/Login/', {
		email,
		password,
	});
	if (data) {
		// TODO: The OpenAPI response for this endpoint isn't defined.
		return data as never as SignInResponse;
	} else {
		throw new Error('Something went wrong');
	}
}

export function useLoginMutation() {
	return useMutation<SignInResponse, Error, SignInCredentials>({
		mutationFn: (loginData) => onLoginSubmit(loginData),
	});
}
