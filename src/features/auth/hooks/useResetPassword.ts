import apiClient from '@/config/apiClient';
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
	const { data } = await apiClient.put('/ResetPassword', {
		token,
		newPassword: password,
	});
	return data as ResetPasswordResponse;
};

export function useResetPasswordMutation() {
	return useMutation<ResetPasswordResponse, Error, ResetPasswordRequest>({
		mutationFn: (formData) => onResetPasswordSubmit(formData),
	});
}
