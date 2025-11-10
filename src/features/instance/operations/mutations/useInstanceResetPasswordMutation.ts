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
	instanceClient,
}: InstanceResetPasswordParams): Promise<LoginInfoResponse> {
	// Do we have a temporary password?
	if (!tempPassword) {
		throw new Error('You may not have permission to set the password on this cluster.');
	}
	try {
		// Sign in with the temporary password,
		const loginResponse = await onInstanceLoginSubmit({
			username: initialUsername,
			password: tempPassword,
			instanceClient,
		});
		// then create a new user
		if (desiredUsername === defaultClusterUsername) {
			await onAlterUser({
				username: desiredUsername,
				password: newPassword,
				instanceClient,
			});
		} else {
			await onAddUserSubmit({
				username: desiredUsername,
				password: newPassword,
				role: 'super_user',
				active: true,
				instanceClient,
			});
			await onDeleteUser({
				username: defaultClusterUsername,
				instanceClient,
			});
			await onInstanceLoginSubmit({
				username: desiredUsername,
				password: newPassword,
				instanceClient,
			});
		}
		// and finally, tell the central manager that we changed their password.
		await resetPasswordUpdater(clusterId);
		return loginResponse;
	} catch (err) {
		// If something went wrong, logout as well.
		await onInstanceLogoutSubmit({
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
