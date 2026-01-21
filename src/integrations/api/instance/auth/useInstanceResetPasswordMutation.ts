import { defaultClusterUsername } from '@/config/constants';
import { InstanceClientConfig } from '@/config/instanceClientConfig';
import { resetPasswordUpdater } from '@/features/cluster/queries/resetPasswordUpdater';
import { useMutation } from '@tanstack/react-query';
import { onAddUserSubmit } from './addUser';
import { onAlterUser } from './alterUser';
import { onDeleteUser } from './deleteUser';
import { onInstanceLogoutSubmit } from './onInstanceLogoutSubmit';
import { LoginInfoResponse, onInstanceLoginSubmit } from './useInstanceLoginMutation';

interface InstanceResetPasswordParams extends InstanceClientConfig {
	clusterId: string;
	initialUsername: string;
	desiredUsername: string;
	newPassword: string;
	tempPassword: string | undefined;
}

async function onInstanceResetPassword({
	clusterId,
	initialUsername,
	desiredUsername,
	newPassword,
	tempPassword,
	instanceClient: initialInstanceClient,
}: InstanceResetPasswordParams): Promise<LoginInfoResponse> {
	// Do we have a temporary password?
	if (!tempPassword) {
		throw new Error('You may not have permission to set the password on this cluster.');
	}
	let instanceClient = initialInstanceClient;
	try {
		// Sign in with the temporary password,
		const loginResponse = await onInstanceLoginSubmit({
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
			await onInstanceLoginSubmit({
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
		return loginResponse;
	} catch (err) {
		// If something went wrong, logout as well.
		await onInstanceLogoutSubmit({
			entityId: clusterId,
			instanceClient,
		});
		throw err;
	}
}

export function useInstanceResetPasswordMutation() {
	return useMutation<LoginInfoResponse, Error, InstanceResetPasswordParams>({
		mutationFn: onInstanceResetPassword,
	});
}
