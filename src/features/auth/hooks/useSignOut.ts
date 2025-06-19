import apiClient from '@/config/apiClient';
import { useMutation } from '@tanstack/react-query';

// TODO: Consolidate with useOnSignUpSubmitMutation

export const onSignOutSubmit = async () => {
	// TODO: OpenAPI only describes a 200, not a 204.
	const { status } = await apiClient.post('/Logout/');
	if (status === 204) {
		return;
	}
};

export function useSignOutMutation() {
	return useMutation({
		mutationFn: () => onSignOutSubmit(),
	});
}
