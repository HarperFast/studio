import { InstanceClientIdConfig } from '@/config/instanceClientConfig';
import { authStore } from '@/features/auth/store/authStore';

interface LogoutInfoResponse {
	message: string;
}

export async function onInstanceLogoutSubmit({ instanceClient, entityId }: InstanceClientIdConfig): Promise<LogoutInfoResponse> {
	const { data } = await instanceClient.post('/', {
		operation: 'logout',
	});
	authStore.flagForBasicAuth(entityId, null);
	if (data) {
		return data;
	} else {
		throw new Error('Something went wrong');
	}
}
