import { apiClient } from '@/config/apiClient';
import { useMutation } from '@tanstack/react-query';

type ResetPasswordRequest = {
	token: string;
	password: string;
};

type ResetPasswordResponse = {
	userId: string;
	email: string;
};

const onResetPasswordSubmit = async ({ token, password }: ResetPasswordRequest): Promise<ResetPasswordResponse> => {
	// TODO: The path here seems like a gap in the OpenAPI specs for our server, /ResetPassword/ does not exist according to it.
	// TODO: The SchemaResetPassword is also not descriptive: Record<string, never> (which is really "unknown").
	const { data } = await apiClient.put('/ResetPassword' as `/ResetPassword/{id}`, {
		token,
		newPassword: password,
	});
	// TODO: The OpenAPI response for this endpoint isn't very good.
	return data as never as ResetPasswordResponse;
};

export function useResetPasswordMutation() {
	return useMutation<ResetPasswordResponse, Error, ResetPasswordRequest>({
		mutationFn: (formData) => onResetPasswordSubmit(formData),
	});
}
