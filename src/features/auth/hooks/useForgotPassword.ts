import { apiClient } from '@/config/apiClient';
import { useMutation } from '@tanstack/react-query';

export type ForgotPasswordCredential = {
	email: string;
	captchaToken?: string;
};

type ForgotPasswordResponse = {
	email: string;
};

export async function onResetPasswordSubmit(
	{ email, captchaToken }: ForgotPasswordCredential,
): Promise<ForgotPasswordResponse> {
	const { data } = await apiClient.post('/ForgotPassword/', {
		email,
		...(captchaToken ? { captchaToken } : {}),
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
		// The form renders CAPTCHA and retryable failures inline and re-raises the rest through
		// errorHandler, so the global toast would double up here.
		meta: { skipGlobalErrorToast: true },
	});
}
