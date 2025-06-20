import { apiClient } from '@/config/apiClient';
import { useMutation } from '@tanstack/react-query';
import { SchemaUser } from '@/lib/api.gen';

// TODO: Consolidate with useOnSignUpSubmitMutation, and clean up the OpenAPI types here.
export interface SignUpCredentials extends SchemaUser {
	email: string;
	password: string;
	firstname: string;
	lastname: string;
};

type SignUpResponse = {
	id: string;
	email: string;
	firstname: string;
	lastname: string;
};

export async function onSignUpSubmit(signUpCredentials: SignUpCredentials): Promise<SignUpResponse> {
	// TODO: The types in our OpenAPI for this endpoint aren't defined.
	const { data } = await apiClient.post<SignUpCredentials>('/User/', signUpCredentials);
	if (data) {
		return data as SignUpResponse;
	} else {
		throw new Error('Something went wrong');
	}
}

export function useSignUpMutation() {
	return useMutation<SignUpResponse, Error, SignUpCredentials>({
		mutationFn: (loginData) => onSignUpSubmit(loginData),
	});
}
