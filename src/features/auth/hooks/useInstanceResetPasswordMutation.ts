import { useMutation } from '@tanstack/react-query';
import { LoginInfoResponse, onInstanceLoginSubmit } from '@/features/auth/hooks/useInstanceLoginMutation';
import { onAlterUser } from '@/features/instance/operations/mutations/alterUser';
import { onInstanceLogoutSubmit } from '@/features/auth/hooks/useInstanceLogoutMutation';
import { resetPasswordUpdater } from '@/features/cluster/queries/resetPasswordUpdater';

export interface InstanceResetPasswordParams {
	clusterId: string;
	username: string;
	newPassword: string;
	operationsUrl: string;
	tempPassword: string | undefined;
}

export async function onInstanceResetPassword({
	clusterId,
	username,
	newPassword,
	operationsUrl,
	tempPassword,
}: InstanceResetPasswordParams): Promise<LoginInfoResponse> {
	// Do we have a temporary password?
	if (!tempPassword) {
		throw new Error('You may not have permission to set the password on this cluster.');
	}
	try {
		// Sign in with the temporary password,
		const loginResponse = await onInstanceLoginSubmit({
			username,
			password: tempPassword,
			operationsUrl,
		});
		// then change to the new password,
		await onAlterUser({
			username,
			password: newPassword,
			operationsUrl,
		});
		// and finally, tell the central manager that we changed their password.
		await resetPasswordUpdater(clusterId);
		return loginResponse;
	} catch (err) {
		// If something went wrong, logout as well.
		await onInstanceLogoutSubmit({
			operationsUrl,
		});
		throw err;
	}
}

export function useInstanceResetPasswordMutation() {
	return useMutation<LoginInfoResponse, Error, InstanceResetPasswordParams>({
		mutationFn: (instanceData) => onInstanceResetPassword(instanceData),
	});
}
