import { apiClient } from '@/config/apiClient';
import { useMutation } from '@tanstack/react-query';
import { logoutOnSuccess } from '@/features/auth/handlers/logoutOnSuccess';

export async function onLogoutSubmit() {
	await apiClient.post('/Logout/');
}

export function useLogoutMutation() {
	return useMutation({
		mutationFn: () => onLogoutSubmit(),
		onSuccess: logoutOnSuccess,
	});
}
