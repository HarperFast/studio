import { defaultClusterUsername } from '@/config/constants';
import { connectsThroughProxy, getInstanceClient } from '@/config/getInstanceClient';
import { authStore } from '@/features/auth/store/authStore';
import { resetPasswordUpdater } from '@/features/cluster/queries/resetPasswordUpdater';
import { LocalUser } from '@/integrations/api/api.patch';
import { operationOf } from '@/integrations/api/isReadOperation';
import { useMutation } from '@tanstack/react-query';
import { type AxiosInstance, isAxiosError } from 'axios';
import { onAddUserSubmit } from './addUser';
import { onAlterUser } from './alterUser';
import { onDeleteUser } from './deleteUser';
import { getListUsers } from './getListUsers';
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
	} catch (err) {
		if (!isLoginRefused(err)) {
			await signOutAfterFailedSetup(clusterId, instanceClient);
			throw err;
		}
		// An earlier attempt changed or dropped the setup account but never told central manager setup was done.
		return finishInterruptedSetup({ clusterId, operationsUrl, initialUsername, desiredUsername, newPassword }).catch(
			async (error: unknown) => {
				await signOutAfterFailedSetup(clusterId, getInstanceClient({ id: clusterId, operationsUrl }));
				throw error;
			},
		);
	}
	try {
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
			try {
				await onAddUserSubmit({
					username: desiredUsername,
					password: newPassword,
					role: 'super_user',
					active: true,
					instanceClient,
				});
			} catch (err) {
				if (!isUserAlreadyExists(err, desiredUsername)) {
					throw err;
				}
				await adoptExistingAdmin({ desiredUsername, newPassword, instanceClient });
			}
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
		await signOutAfterFailedSetup(clusterId, instanceClient);
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

function isLoginRefused(error: unknown): boolean {
	return isAxiosError(error) && error.response?.status === 401 && operationOf(error.config?.data) === 'login';
}

/** Harper's `add_user` refusal for a username already taken, told apart from its other 409 (duplicate roles) by text. */
function isUserAlreadyExists(error: unknown, username: string): boolean {
	return isAxiosError(error)
		&& (error.response?.data as { error?: unknown } | undefined)?.error === `User ${username} already exists`;
}

/**
 * Never throws: a failed logout must not replace the error that ended setup. Setup is still pending, so nothing may stay
 * signed in either way; through the proxy there is no session of the user's to end (see `buildLogoutClient`).
 */
async function signOutAfterFailedSetup(clusterId: string, instanceClient: AxiosInstance): Promise<void> {
	if (!connectsThroughProxy(clusterId)) {
		try {
			await onInstanceLogoutSubmit({ entityId: clusterId, instanceClient });
		} catch (error) {
			console.debug('Could not log out after setup failed', error instanceof Error ? error.message : error);
		}
	}
	authStore.signOutEntitiesLocally([clusterId]);
}

type FormCredentials = Pick<
	InstanceResetPasswordParams,
	'clusterId' | 'operationsUrl' | 'desiredUsername' | 'newPassword'
>;

function signInWithFormCredentials({ clusterId, operationsUrl, desiredUsername, newPassword }: FormCredentials) {
	return onInstanceLoginSubmit({
		username: desiredUsername,
		password: newPassword,
		instanceClient: getInstanceClient({ id: clusterId, operationsUrl, disableFabricConnect: true }),
		entityId: clusterId,
	});
}

function assertSignedInAsAdmin(user: LocalUser, desiredUsername: string): void {
	if (user.username !== desiredUsername) {
		// Login's own Fabric Connect fallback can reach an instance the drop has not replicated to yet.
		throw new Error(
			`Couldn't finish setup: signing in as "${desiredUsername}" answered as "${user.username}". Try again in a moment, or contact support to reset this cluster's setup.`,
		);
	}
	if (user.role?.permission?.super_user !== true) {
		throw new Error(
			`Couldn't finish setup: "${desiredUsername}" can sign in, but the cluster doesn't report it as a super user. Contact support to reset this cluster's setup.`,
		);
	}
}

/**
 * `add_user` found the form's admin already there: an earlier attempt created it and stopped before dropping the setup
 * account. That account still signs in, so it sets the typed password, and the sign-in that follows proves it. Signing
 * in first instead would not tell the admin apart where Fabric Connect is the fallback: it still resolves to the setup
 * account.
 */
async function adoptExistingAdmin(
	{ desiredUsername, newPassword, instanceClient }: Pick<FormCredentials, 'desiredUsername' | 'newPassword'> & {
		instanceClient: AxiosInstance;
	},
): Promise<void> {
	const existing = (await getListUsers({ instanceClient })).find((user) => user.username === desiredUsername);
	if (existing?.role?.permission?.super_user !== true) {
		throw new Error(
			`Couldn't finish setup: "${desiredUsername}" already exists on this cluster but isn't a super user. Choose another username.`,
		);
	}
	await onAlterUser({ username: desiredUsername, password: newPassword, instanceClient });
}

/** See "An interrupted setup finishes from the admin it already created" in `src/features/cluster/DESIGN.md`. */
async function finishInterruptedSetup({
	clusterId,
	operationsUrl,
	initialUsername,
	desiredUsername,
	newPassword,
}: Pick<
	InstanceResetPasswordParams,
	'clusterId' | 'operationsUrl' | 'initialUsername' | 'desiredUsername' | 'newPassword'
>): Promise<InstanceResetPasswordResponse> {
	const signInAsAdmin = () => signInWithFormCredentials({ clusterId, operationsUrl, desiredUsername, newPassword });
	try {
		const { message, user } = await signInAsAdmin();
		assertSignedInAsAdmin(user, desiredUsername);
		await resetPasswordUpdater(clusterId);
		return { message, user };
	} catch (err) {
		if (!isLoginRefused(err)) {
			throw err;
		}
	}

	let user: LocalUser;
	try {
		user = await authStore.establishFabricConnectAuth({ id: clusterId, operationsUrl });
	} catch (err) {
		throw new Error(
			`Couldn't finish setup: the password you entered doesn't sign in as "${desiredUsername}", and Fabric Connect couldn't reach the cluster to finish instead. Try again, or contact support to reset this cluster's setup.`,
			{ cause: err },
		);
	}
	// While the setup account exists, Fabric Connect resolves to it: Harper's first super user.
	if (user.username === initialUsername || user.role?.permission?.super_user !== true) {
		throw new Error(
			`Couldn't finish setup: Fabric Connect signs in as "${user.username}", not as an admin user setup created. Contact support to reset this cluster's setup.`,
		);
	}
	if (user.username !== desiredUsername) {
		throw new Error(
			`Couldn't finish setup: this cluster's admin user is already "${user.username}". Enter that username to finish.`,
		);
	}
	await onAlterUser({
		username: desiredUsername,
		password: newPassword,
		instanceClient: getInstanceClient({ id: clusterId, operationsUrl }),
	});
	await resetPasswordUpdater(clusterId);
	try {
		const direct = await signInAsAdmin();
		if (!direct.instanceClient) {
			authStore.flagForFabricConnect(clusterId, false);
		} else if (direct.user.username !== desiredUsername) {
			// Login's own Fabric Connect fallback reached an instance the earlier drop has not replicated to.
			authStore.signOutLocally(clusterId);
			return { message: direct.message, user: null };
		}
		return { message: direct.message, user: direct.user };
	} catch (error) {
		// The instance the cluster's address reached may not have the new password yet; Fabric Connect still works.
		console.debug('Could not sign in directly after finishing setup', error instanceof Error ? error.message : error);
		return { message: 'Login successful', user };
	}
}

export function useInstanceResetPasswordMutation() {
	return useMutation<InstanceResetPasswordResponse, Error, InstanceResetPasswordParams>({
		mutationFn: onInstanceResetPassword,
	});
}
