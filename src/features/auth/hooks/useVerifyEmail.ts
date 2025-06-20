import { apiClient } from '@/config/apiClient';
import { useMutation } from '@tanstack/react-query';

// TODO: Consolidate with useOnSignUpSubmitMutation
type VerifyEmailToken = {
	token: string;
};

type VerifyEmailResponse = {
	useId: string;
	email: string;
};

const onVerifyEmailTokenSubmit = async (token: VerifyEmailToken): Promise<VerifyEmailResponse> => {
	// TODO: The OpenAPI types don't describe a top level /VerifyEmail/
	// TODO: The OpenAPI types don't describe the request body, either; Record<string, never>
	const { data } = await apiClient.put<VerifyEmailToken>('/VerifyEmail' as '/VerifyEmail/{id}', {
		token: token.toString(),
	});
	return data as VerifyEmailResponse;
};

function useVerifyEmailMutation() {
	return useMutation<VerifyEmailResponse, Error, VerifyEmailToken>({
		mutationFn: (emailToken) => onVerifyEmailTokenSubmit(emailToken),
	});
}

export type { VerifyEmailToken, VerifyEmailResponse };
export { useVerifyEmailMutation };
