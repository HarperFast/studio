import { apiClient } from '@/config/apiClient';
import { isLocalStudio } from '@/config/constants';
import { logoutOnSuccess } from '@/features/auth/handlers/logoutOnSuccess';
import { onInstanceLogoutSubmit } from '@/features/auth/hooks/useInstanceLogoutMutation';
import { authStore } from '@/lib/authStore';
import { useMutation } from '@tanstack/react-query';

export async function onLogoutSubmit() {
	await authStore.signOutFromPotentiallyAuthenticatedInstances();
	if (isLocalStudio) {
		await onInstanceLogoutSubmit();
	} else {
		await apiClient.post('/Logout/');
	}
}

export function useLogoutMutation() {
	return useMutation({
		mutationFn: () => onLogoutSubmit(),
		onSuccess: logoutOnSuccess,
	});
}
