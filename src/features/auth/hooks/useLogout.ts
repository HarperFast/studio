import { apiClient } from '@/config/apiClient';
import { authStore } from '@/lib/authStore';
import { useMutation } from '@tanstack/react-query';
import { logoutOnSuccess } from '@/features/auth/handlers/logoutOnSuccess';

export async function onLogoutSubmit() {
	await authStore.signOutFromPotentiallyAuthenticatedInstances();
	await apiClient.post('/Logout/');
}

export function useLogoutMutation() {
	return useMutation({
		mutationFn: () => onLogoutSubmit(),
		onSuccess: logoutOnSuccess,
	});
}
