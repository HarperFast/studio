import { apiClient } from '@/config/apiClient';
import { isLocalStudio } from '@/config/constants';
import { InstanceClientConfig } from '@/config/instanceClientConfig';
import { useInstanceClient } from '@/config/useInstanceClient';
import { logoutOnSuccess } from '@/features/auth/handlers/logoutOnSuccess';
import { authStore, OverallAppSignIn } from '@/features/auth/store/authStore';
import { onInstanceLogoutSubmit } from '@/features/instance/operations/mutations/onInstanceLogoutSubmit';
import { useMutation } from '@tanstack/react-query';

async function onLogoutSubmit(instanceClientConfig: InstanceClientConfig) {
	await authStore.signOutFromPotentiallyAuthenticatedInstances();
	if (isLocalStudio) {
		await onInstanceLogoutSubmit({ ...instanceClientConfig, entityId: OverallAppSignIn });
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
