import { apiClient } from '@/config/apiClient';
import { useMutation } from '@tanstack/react-query';

export type ForgotPasswordCredential = {
	email: string;
};

type ForgotPasswordResponse = {
	email: string;
};

export async function onResetPasswordSubmit({ email }: ForgotPasswordCredential): Promise<ForgotPasswordResponse> {
	const { data } = await apiClient.post('/ForgotPassword/', {
		email,
	});
	if (data) {
		// TODO: The OpenAPI description isn't accurate.
		return data as ForgotPasswordResponse;
	} else {
		throw new Error('Something went wrong');
	}
}

export function useForgotPasswordMutation() {
	return useMutation<ForgotPasswordResponse, Error, ForgotPasswordCredential>({
		mutationFn: (loginData) => onResetPasswordSubmit(loginData),
	});
}
