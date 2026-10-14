import { InstanceClientIdConfig } from '@/config/instanceClientConfig';
import { authStore } from '@/features/auth/store/authStore';

interface LogoutInfoResponse {
	message: string;
}

export async function onInstanceLogoutSubmit(
	{ instanceClient, entityId, signedInSince }: InstanceClientIdConfig & { signedInSince?: () => boolean },
): Promise<LogoutInfoResponse> {
	const { data } = await instanceClient.post('/', {
		operation: 'logout',
	});
	if (!signedInSince?.()) {
		authStore.flagForBasicAuth(entityId, null);
		authStore.flagForFabricConnect(entityId, false);
	}
	if (data) {
		return data;
	} else {
		throw new Error('Something went wrong');
	}
}
