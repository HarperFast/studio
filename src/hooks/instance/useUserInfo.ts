import apiClient from '@/config/apiClient';
import { useMutation } from '@tanstack/react-query';

// TODO: Consolidate with useOnSignUpSubmitMutation
export type SignInCredentials = {
	instanceUser: string;
	instancePassword: string;
};

type SignInResponse = {
	id: string;
	email: string;
	firstname: string;
	lastname: string;
};

export const onUserInfoSubmit = async (): Promise<SignInResponse> => {
	// TODO: The OpenAPI specs don't describe this endpoint.
	const { data } = await apiClient.post('/' as never, {
		operation: 'user_info',
	});
	if (data) {
		return data as SignInResponse;
	} else {
		throw new Error('Something went wrong');
	}
};

export function useUserInfoMutation() {
	return useMutation({
		mutationFn: () => onUserInfoSubmit(),
	});
}
