import { apiClient } from '@/config/apiClient';
import { isLocalStudio } from '@/config/constants';
import { InstanceClientConfig } from '@/config/instanceClientConfig';
import { useInstanceClient } from '@/config/useInstanceClient';
import { logoutOnSuccess } from '@/features/auth/handlers/logoutOnSuccess';
import { onInstanceLogoutSubmit } from '@/features/instance/operations/mutations/onInstanceLogoutSubmit';
import { authStore } from '@/lib/authStore';
import { useMutation } from '@tanstack/react-query';

async function onLogoutSubmit(instanceClientConfig: InstanceClientConfig) {
	await authStore.signOutFromPotentiallyAuthenticatedInstances();
	if (isLocalStudio) {
		await onInstanceLogoutSubmit(instanceClientConfig);
	} else {
		await apiClient.post('/Logout/');
	}
}

export function useLogoutMutation() {
	const instanceClient = useInstanceClient();
	return useMutation({
		mutationFn: () => onLogoutSubmit({ instanceClient }),
		onSuccess: logoutOnSuccess,
	});
}
