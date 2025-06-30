import { apiClient } from '@/config/apiClient';
import { useMutation } from '@tanstack/react-query';

export async function onSignOutSubmit() {
	await apiClient.post('/Logout/');
}

export function useSignOutMutation() {
	return useMutation({
		mutationFn: () => onSignOutSubmit(),
	});
}
