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
	const auth = {
		username,
		password,
	};
	if (authStore.checkForBasicAuth(entityId)) {
		instanceClient.defaults.auth = auth;
		instanceClient.defaults.withCredentials = false;
	}

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
		instanceClient.defaults.auth = auth;
		instanceClient.defaults.withCredentials = false;
		const user = await getInstanceUserInfo({
			instanceClient,
			auth,
		});
		authStore.flagForBasicAuth(entityId, auth);
		return {
			message,
			user,
		};
	} catch (err) {
		instanceClient.defaults.auth = undefined;
		instanceClient.defaults.withCredentials = true;
		if (isLocalStudio) {
			throw err;
		}
		console.error('Failed to get user with basic auth, trying Fabric Connect', err);
	}

	// The user's own credentials worked for the login operation but neither session cookies nor basic
	// auth stuck (e.g. cross-origin cookie restrictions). Fall back to Fabric Connect: grab a JWT via
	// the proxy and connect to the instance directly with it, or proxy everything if that's not
	// reachable either.
	const user = await authStore.establishFabricConnectAuth({
		id: entityId,
		operationsUrl: instanceClient.defaults.baseURL,
	});
	return {
		message,
		user,
		// Hand back a client rebuilt from the now-established auth (Bearer-direct or proxy-routed) so
		// callers that keep issuing operations on the returned client — e.g. the reset-password /
		// Finish Setup flow — don't reuse the stale pre-fallback (cookie-mode) client.
		instanceClient: getInstanceClient({ id: entityId, operationsUrl: instanceClient.defaults.baseURL }),
	};
}

export function useInstanceLoginMutation() {
	return useMutation<LoginInfoResponse, Error, InstanceLoginCredentials>({
		mutationFn: onInstanceLoginSubmit,
	});
}
