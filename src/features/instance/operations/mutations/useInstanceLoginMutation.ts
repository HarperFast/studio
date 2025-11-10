import { InstanceClientIdConfig } from '@/config/instanceClientConfig';
import { authStore } from '@/features/auth/store/authStore';
import { getInstanceUserInfo } from '@/features/instance/operations/queries/getInstanceUserInfo';
import { LocalUser } from '@/lib/api.patch';
import { useMutation } from '@tanstack/react-query';

interface InstanceLoginCredentials extends InstanceClientIdConfig {
	username: string;
	password: string;
}

export interface LoginInfoResponse {
	message: string;
	user: LocalUser;
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

	// Attempt to use the login with session storage only.
	try {
		const user = await getInstanceUserInfo({ instanceClient });
		return {
			message,
			user,
		};
	} catch (err) {
		console.error('Failed to get user after login, trying basic auth', err);

		const user = await getInstanceUserInfo({
			instanceClient,
			auth: {
				username,
				password,
			},
		});
		authStore.flagForBasicAuth(entityId, { username, password });
		return {
			message,
			user,
		};
	}
}

export function useInstanceLoginMutation() {
	return useMutation<LoginInfoResponse, Error, InstanceLoginCredentials>({
		mutationFn: onInstanceLoginSubmit,
	});
}
