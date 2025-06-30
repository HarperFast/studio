import { apiClient } from '@/config/apiClient';
import { useMutation } from '@tanstack/react-query';
import { User } from '@/lib/api.patch';

// TODO: Consolidate with useOnSignUpSubmitMutation
export type SignInCredentials = {
	email: string;
	password: string;
};

export async function onLoginSubmit({ email, password }: SignInCredentials): Promise<User> {
	// TODO: The OpenAPI request body for this endpoint isn't defined.
	const { data } = await apiClient.post('/Login/', {
		email,
		password,
	});
	if (data) {
		// TODO: The OpenAPI response for this endpoint isn't defined.
		return data as never as User;
	} else {
		throw new Error('Something went wrong');
	}
}

export function useLoginMutation() {
	return useMutation<User, Error, SignInCredentials>({
		mutationFn: (loginData) => onLoginSubmit(loginData),
	});
}
