import { forceBasicAuth, isLocalStudio } from '@/config/constants';
import { getInstanceClient } from '@/config/getInstanceClient';
import { InstanceClientIdConfig } from '@/config/instanceClientConfig';
import { authStore } from '@/features/auth/store/authStore';
import { LocalUser } from '@/integrations/api/api.patch';
import { getInstanceUserInfo } from '@/integrations/api/instance/status/getInstanceUserInfo';
import { useMutation } from '@tanstack/react-query';
import { AxiosInstance } from 'axios';

interface InstanceLoginCredentials extends InstanceClientIdConfig {
	username: string;
	password: string;
}

export interface LoginInfoResponse {
	message: string;
	user: LocalUser;
	instanceClient?: AxiosInstance;
}

export async function onInstanceLoginSubmit({
	username,
	password,
	instanceClient,
	entityId,
}: InstanceLoginCredentials): Promise<LoginInfoResponse> {
	const { data: { message } } = await instanceClient.post('/', {
		operation: 'login',
		username,
		password,
	});

	if (!forceBasicAuth && !authStore.checkForBasicAuth(entityId)) {
		// Attempt to use the login with session storage only.
		try {
			const user = await getInstanceUserInfo({ instanceClient });
			return {
				message,
				user,
			};
		} catch (err) {
			console.error('Failed to get user after login, trying basic auth', err);
		}
	}

	try {
		const auth = {
			username,
			password,
		};
		delete instanceClient.defaults.auth;
		const user = await getInstanceUserInfo({
			instanceClient,
			auth,
		});
		instanceClient.defaults.auth = auth;
		instanceClient.defaults.withCredentials = false;
		authStore.flagForBasicAuth(entityId, auth);
		return {
			message,
			user,
		};
	} catch (err) {
		if (isLocalStudio) {
			throw err;
		}
		console.error('Failed to get user with basic auth, trying Fabric Connect', err);
	}

	const fabricInstanceClient = getInstanceClient({
		id: entityId,
		forceFabricConnect: true,
	});
	const user = await getInstanceUserInfo({
		instanceClient: fabricInstanceClient,
	});
	authStore.flagForFabricConnect(entityId, true);
	return {
		message,
		user,
		instanceClient: fabricInstanceClient,
	};
}

export function useInstanceLoginMutation() {
	return useMutation<LoginInfoResponse, Error, InstanceLoginCredentials>({
		mutationFn: onInstanceLoginSubmit,
	});
}
