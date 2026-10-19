import { defaultClusterUsername } from '@/config/constants';
import { getInstanceClient } from '@/config/getInstanceClient';
import { authStore } from '@/features/auth/store/authStore';
import { resetPasswordUpdater } from '@/features/cluster/queries/resetPasswordUpdater';
import { LocalUser } from '@/integrations/api/api.patch';
import { useMutation } from '@tanstack/react-query';
import { onAddUserSubmit } from './addUser';
import { onAlterUser } from './alterUser';
import { onDeleteUser } from './deleteUser';
import { onInstanceLogoutSubmit } from './onInstanceLogoutSubmit';
import { LoginInfoResponse, onInstanceLoginSubmit } from './useInstanceLoginMutation';

interface InstanceResetPasswordParams {
	clusterId: string;
	operationsUrl: string;
	signInIds: string[];
	initialUsername: string;
	desiredUsername: string;
	newPassword: string;
	tempPassword: string | undefined;
}

interface InstanceResetPasswordResponse {
	message: string;
	/** Null when setup finished but could not connect again afterwards. */
	user: LocalUser | null;
}

async function onInstanceResetPassword({
	clusterId,
	operationsUrl,
	signInIds,
	initialUsername,
	desiredUsername,
	newPassword,
	tempPassword,
}: InstanceResetPasswordParams): Promise<InstanceResetPasswordResponse> {
	// Do we have a temporary password?
	if (!tempPassword) {
		throw new Error('You may not have permission to set the password on this cluster.');
	}
	// A connection made before setup is the provisioning account's: every step below would run as it, whatever
	// credentials they present, and it stops working once that account is dropped.
	authStore.signOutEntitiesLocally(signInIds);
	let instanceClient = getInstanceClient({ id: clusterId, operationsUrl });
	let loginResponse: LoginInfoResponse;
	try {
		// Sign in with the temporary password,
		loginResponse = await onInstanceLoginSubmit({
			username: initialUsername,
			password: tempPassword,
			instanceClient,
			entityId: clusterId,
		});
		if (loginResponse.instanceClient) {
			instanceClient = loginResponse.instanceClient;
		}
		// if the usernames match, we need to alter the user...
		if (desiredUsername === defaultClusterUsername) {
			await onAlterUser({
				username: desiredUsername,
				password: newPassword,
				instanceClient,
			});
		} else {
			// ... or create a new user!
			await onAddUserSubmit({
				username: desiredUsername,
				password: newPassword,
				role: 'super_user',
				active: true,
				instanceClient,
			});
			// since we created a new user, we should log in with the new one
			loginResponse = await onInstanceLoginSubmit({
				username: desiredUsername,
				password: newPassword,
				instanceClient,
				entityId: clusterId,
			});
			// clean up the old one
			await onDeleteUser({
				username: defaultClusterUsername,
				instanceClient,
			});
		}
		// and finally, tell the central manager that we changed their password.
		await resetPasswordUpdater(clusterId);
	} catch (err) {
		// If something went wrong, logout as well.
		await onInstanceLogoutSubmit({
			entityId: clusterId,
			instanceClient,
		});
		throw err;
	}
	if (desiredUsername !== defaultClusterUsername && authStore.hasResolvedFabricConnect(clusterId)) {
		// Login fell back to Fabric Connect, which connected as the account just dropped. Setup is done either way, so a
		// failed reconnect signs the cluster out instead of failing setup.
		const user = await authStore.establishFabricConnectAuth({ id: clusterId, operationsUrl }).catch(
			(error: unknown) => {
				console.debug('Could not reconnect after setup', error instanceof Error ? error.message : error);
				return null;
			},
		);
		// The proxy can reach an instance the drop has not replicated to yet.
		if (!user || user.username === defaultClusterUsername) {
			authStore.signOutLocally(clusterId);
			return { message: loginResponse.message, user: null };
		}
		return { message: loginResponse.message, user };
	}
	return loginResponse;
}

export function useInstanceResetPasswordMutation() {
	return useMutation<InstanceResetPasswordResponse, Error, InstanceResetPasswordParams>({
		mutationFn: onInstanceResetPassword,
	});
}
