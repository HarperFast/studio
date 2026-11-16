import { defaultClusterUsername } from '@/config/constants';
import { connectsThroughProxy, getInstanceClient } from '@/config/getInstanceClient';
import { authStore } from '@/features/auth/store/authStore';
import { resetPasswordUpdater } from '@/features/cluster/queries/resetPasswordUpdater';
import { SealedSetupCapability } from '@/features/cluster/sealedSetup';
import { LocalUser } from '@/integrations/api/api.patch';
import { isSealedRefusal, runSealedOperation } from '@/integrations/api/instance/sealedOperation';
import { SecretsPublicKey, secretsPublicKeyQueryOptions } from '@/integrations/api/instance/secrets/secrets';
import { operationOf } from '@/integrations/api/isReadOperation';
import { SealableOperation } from '@/lib/crypto/sealedOperation';
import { QueryClient, useMutation, useQueryClient } from '@tanstack/react-query';
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
	sealedSetup?: SealedSetupCapability;
}

interface InstanceResetPasswordResponse {
	message: string;
	/** Null when setup finished but could not connect again afterwards. */
	user: LocalUser | null;
}

async function onInstanceResetPassword(
	queryClient: QueryClient,
	params: InstanceResetPasswordParams,
): Promise<InstanceResetPasswordResponse> {
	if (params.sealedSetup) {
		return finishSetupSealed(queryClient, params, params.sealedSetup);
	}
	return finishSetupWithTemporaryPassword(params);
}

async function finishSetupWithTemporaryPassword({
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

function clusterKeyQuery(clusterId: string) {
	return secretsPublicKeyQueryOptions({
		entityId: clusterId,
		instanceClient: getInstanceClient({ id: clusterId, forceFabricConnect: true }),
		managedClusterId: clusterId,
	});
}

async function refetchClusterKey(queryClient: QueryClient, clusterId: string): Promise<SecretsPublicKey> {
	queryClient.removeQueries({ queryKey: clusterKeyQuery(clusterId).queryKey });
	return queryClient.ensureQueryData(clusterKeyQuery(clusterId));
}

/** See "Setup on 5.4.0+ seals its writes through the proxy" in `src/features/cluster/DESIGN.md`. */
async function finishSetupSealed(
	queryClient: QueryClient,
	{ clusterId, operationsUrl, signInIds, desiredUsername, newPassword }: InstanceResetPasswordParams,
	{ keyFingerprint }: SealedSetupCapability,
): Promise<InstanceResetPasswordResponse> {
	authStore.signOutEntitiesLocally(signInIds);
	const signOutGeneration = authStore.getSignOutGeneration(clusterId);
	// The members hold the key by its fingerprint; a cached key with another is stale, and one that stays different
	// after a fresh read is a cluster whose key is changing under setup.
	let key = await queryClient.ensureQueryData(clusterKeyQuery(clusterId));
	if (key.fingerprint !== keyFingerprint) {
		key = await refetchClusterKey(queryClient, clusterId);
		if (key.fingerprint !== keyFingerprint) {
			throw new Error(
				"Couldn't finish setup: central manager's key for this cluster is not the one its members hold. Try again in a moment.",
			);
		}
	}
	const instanceClient = getInstanceClient({ id: clusterId, forceFabricConnect: true });
	const refreshKey = async () => (key = await refetchClusterKey(queryClient, clusterId));
	const seal = (op: SealableOperation) =>
		runSealedOperation({ instanceClient, op, key, refreshKey, actor: 'Studio Finish Setup' });

	if (desiredUsername === defaultClusterUsername) {
		await seal({ operation: 'alter_user', username: desiredUsername, password: newPassword });
	} else {
		try {
			await seal({
				operation: 'add_user',
				username: desiredUsername,
				password: newPassword,
				role: 'super_user',
				active: true,
			});
		} catch (err) {
			if (!isSealedRefusal(err, 409, `User ${desiredUsername} already exists`)) {
				throw err;
			}
			// An earlier attempt created the admin and stopped before the drop: adopt it, as the direct flow does. The
			// password set below does not activate a user, so an inactive one could never sign in afterwards.
			const users = (await seal({ operation: 'list_users' })).body as LocalUser[];
			const existing = users.find((user) => user.username === desiredUsername);
			if (existing?.role?.permission?.super_user !== true || !existing.active) {
				throw new Error(
					`Couldn't finish setup: "${desiredUsername}" already exists on this cluster but isn't an active super user. Choose another username.`,
				);
			}
			await seal({ operation: 'alter_user', username: desiredUsername, password: newPassword });
		}
	}
	// Minted with the typed credentials, the tokens are the admin's and nobody else's: the node checks the password
	// and names that user, however many super users another attempt left. This is also the proof the admin signs in,
	// taken before the account that created it goes.
	const minted =
		(await seal({ operation: 'create_authentication_tokens', username: desiredUsername, password: newPassword }))
			.body as { operation_token?: string; refresh_token?: string };
	if (!minted?.operation_token) {
		throw new Error("Couldn't finish setup: the cluster did not return a token for the new admin.");
	}
	if (desiredUsername !== defaultClusterUsername) {
		try {
			await seal({ operation: 'drop_user', username: defaultClusterUsername });
		} catch (err) {
			if (!isSealedRefusal(err, 404, `User ${defaultClusterUsername} does not exist`)) {
				throw err;
			}
		}
	}
	await resetPasswordUpdater(clusterId);

	// Setup is done; this only connects the browser as the admin, directly or not at all: through the proxy the session
	// would be the proxy's own principal, not the admin's. A failed connect, or a sign-out that landed meanwhile, leaves
	// the cluster signed out.
	if (authStore.getSignOutGeneration(clusterId) !== signOutGeneration) {
		return { message: 'Login successful', user: null };
	}
	const user = await authStore.establishFabricConnectAuth({
		id: clusterId,
		operationsUrl,
		tokens: { operationToken: minted.operation_token, refreshToken: minted.refresh_token },
	}).catch((error: unknown) => {
		console.debug('Could not connect after setup', error instanceof Error ? error.message : error);
		return null;
	});
	if (user?.username !== desiredUsername || user.role?.permission?.super_user !== true || !user.active) {
		authStore.signOutLocally(clusterId);
		return { message: 'Login successful', user: null };
	}
	return { message: 'Login successful', user };
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
	const queryClient = useQueryClient();
	return useMutation<InstanceResetPasswordResponse, Error, InstanceResetPasswordParams>({
		mutationFn: (params) => onInstanceResetPassword(queryClient, params),
	});
}
