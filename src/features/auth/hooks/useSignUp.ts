import { apiClient } from '@/config/apiClient';
import { useMutation } from '@tanstack/react-query';
import { SchemaUser } from '@/lib/api.gen';

export interface SignUpCredentials extends Omit<SchemaUser, 'id'> {
	email: string;
	password: string;
	firstname: string;
	lastname: string;
}

export async function onSignUpSubmit(signUpCredentials: SignUpCredentials) {
	// TODO: The types in our OpenAPI for this endpoint aren't defined.
	const { data } = await apiClient.post('/User/', signUpCredentials);
	if (data) {
		return data;
	} else {
		throw new Error('Something went wrong');
	}
}

export function useSignUpMutation() {
	return useMutation<SchemaUser, Error, SignUpCredentials>({
		mutationFn: (loginData) => onSignUpSubmit(loginData),
	});
}
