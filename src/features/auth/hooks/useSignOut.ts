import apiClient from '@/config/apiClient';
import { useMutation } from '@tanstack/react-query';

// TODO: Consolidate with useOnSignUpSubmitMutation

export const onSignOutSubmit = async () => {
	const { status } = await apiClient.post('/Logout');
	if (status === 204) {
		return;
	}
};

export function useSignOutMutation() {
	return useMutation({
		mutationFn: () => onSignOutSubmit(),
	});
}
