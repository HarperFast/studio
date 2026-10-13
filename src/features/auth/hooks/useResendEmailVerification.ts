import { apiClient } from '@/config/apiClient';
import { useMutation } from '@tanstack/react-query';
import { failFastOffline, toastsAuthFailures } from '../failFastOffline';

export type ResendEmailVerificationRequest = {
	email: string;
};

type ResendVerificationEmailResponse = {
	email: string;
};

const onResendEmailVerificationSubmit = async ({
	email,
}: ResendEmailVerificationRequest): Promise<ResendVerificationEmailResponse> => {
	// TODO: The OpenAPI request body for this endpoint isn't very descriptive.
	const { data } = await apiClient.post<ResendEmailVerificationRequest>('/ResendVerificationEmail/', {
		email,
	});
	return data;
};

export function useResendEmailVerification() {
	return useMutation<ResendVerificationEmailResponse, Error, ResendEmailVerificationRequest>({
		...failFastOffline(onResendEmailVerificationSubmit),
		...toastsAuthFailures,
	});
}
