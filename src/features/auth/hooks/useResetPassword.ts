import { apiClient } from '@/config/apiClient';
import { useMutation } from '@tanstack/react-query';
import { failFastOffline, toastsAuthFailures } from '../failFastOffline';

type ResetPasswordRequest = {
	token: string;
	password: string;
};

type ResetPasswordResponse = {
	userId: string;
	email: string;
};

const onResetPasswordSubmit = async ({ token, password }: ResetPasswordRequest): Promise<ResetPasswordResponse> => {
	// TODO: The SchemaResetPassword is also not descriptive: Record<string, never> (which is really "unknown").
	const { data } = await apiClient.put('/ResetPassword/', {
		token,
		newPassword: password,
	});
	// TODO: The OpenAPI response for this endpoint isn't very good.
	return data as ResetPasswordResponse;
};

export function useResetPasswordMutation() {
	return useMutation<ResetPasswordResponse, Error, ResetPasswordRequest>({
		...failFastOffline(onResetPasswordSubmit),
		...toastsAuthFailures,
	});
}
