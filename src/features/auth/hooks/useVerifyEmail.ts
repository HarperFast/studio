import { apiClient } from '@/config/apiClient';
import { useMutation } from '@tanstack/react-query';
import { failFastOffline, toastsAuthFailures } from '../failFastOffline';

type VerifyEmailToken = {
	token: string;
};

type VerifyEmailResponse = {
	useId: string;
	email: string;
};

const onVerifyEmailTokenSubmit = async (token: VerifyEmailToken): Promise<VerifyEmailResponse> => {
	// TODO: The OpenAPI types don't describe the request body, either; Record<string, never>
	const { data } = await apiClient.put<VerifyEmailToken>('/VerifyEmail/', {
		token: token.toString(),
	});
	return data as VerifyEmailResponse;
};

function useVerifyEmailMutation() {
	return useMutation<VerifyEmailResponse, Error, VerifyEmailToken>({
		...failFastOffline(onVerifyEmailTokenSubmit),
		...toastsAuthFailures,
	});
}

export type { VerifyEmailResponse, VerifyEmailToken };
export { useVerifyEmailMutation };
