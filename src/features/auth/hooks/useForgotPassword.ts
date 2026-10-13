import { apiClient } from '@/config/apiClient';
import { useMutation } from '@tanstack/react-query';
import { failFastOffline, reportAuthFailure } from '../failFastOffline';
import { isCaptchaVerificationError } from '../isCaptchaVerificationError';
import { clearCaptchaFailures } from './useCaptchaChallenge';

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
		...failFastOffline(onResetPasswordSubmit),
		meta: { skipGlobalErrorToast: true },
		onSuccess: () => clearCaptchaFailures(),
		// At mutation level, not in the caller's `mutate` callback: React Query skips those when
		// the component unmounts mid-flight, and this is the only thing reporting the rejection
		// now that `skipGlobalErrorToast` keeps `errorHandler` out of the path. A CAPTCHA rejection
		// is the check's expected verdict, which the form states inline.
		onError: (error) => {
			if (!isCaptchaVerificationError(error)) {
				clearCaptchaFailures();
				reportAuthFailure(error);
			}
		},
	});
}
