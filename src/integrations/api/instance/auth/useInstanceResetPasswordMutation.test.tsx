/** @vitest-environment jsdom */
import { defaultClusterUsername } from '@/config/constants';
import { getInstanceClient } from '@/config/getInstanceClient';
import { authStore } from '@/features/auth/store/authStore';
import type { LocalUser } from '@/integrations/api/api.patch';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import { AxiosError, AxiosHeaders, type AxiosInstance } from 'axios';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const onInstanceLoginSubmit = vi.fn();
vi.mock('./useInstanceLoginMutation', () => ({
	onInstanceLoginSubmit: (...args: unknown[]) => onInstanceLoginSubmit(...args),
}));
vi.mock('./addUser', () => ({ onAddUserSubmit: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./alterUser', () => ({ onAlterUser: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./deleteUser', () => ({ onDeleteUser: vi.fn() }));
vi.mock('./getListUsers', () => ({ getListUsers: vi.fn() }));
vi.mock('./onInstanceLogoutSubmit', () => ({ onInstanceLogoutSubmit: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/features/cluster/queries/resetPasswordUpdater', () => ({
	resetPasswordUpdater: vi.fn().mockResolvedValue(undefined),
}));

// Fabric Connect as Harper answers it: the proxy mints for the first super user, which is the provisioning account
// until it is dropped, and `user_info` answers for whoever the Bearer names.
let provisioningAccountDropped = false;
const createInstanceAuthenticationTokens = vi.fn();
vi.mock('@/integrations/api/instance/auth/createInstanceAuthenticationTokens', () => ({
	createInstanceAuthenticationTokens: (...args: unknown[]) => createInstanceAuthenticationTokens(...args),
	refreshInstanceOperationToken: vi.fn(),
}));
let ownerIsSuperUser = true;
vi.mock('@/integrations/api/instance/status/getInstanceUserInfo', () => ({
	getInstanceUserInfo: async ({ instanceClient }: { instanceClient: AxiosInstance }) => {
		const authorization = instanceClient.defaults.headers.Authorization;
		if (typeof authorization === 'string' && authorization.startsWith(`Bearer ${sealedNode.tokenPrefix}`)) {
			await sealedNode.beforeUserInfo?.();
			return sealedNode.userInfo(authorization.slice(`Bearer ${sealedNode.tokenPrefix}`.length));
		}
		return authorization === 'Bearer owner-token'
			? localUser(OWNER, ownerIsSuperUser)
			: localUser(defaultClusterUsername);
	},
}));

// The sealed path: what a 5.4 node answers inside the envelope, and the key central manager holds for the cluster.
const runSealedOperation = vi.fn();
vi.mock('@/integrations/api/instance/sealedOperation', async (importOriginal) => ({
	...(await importOriginal<typeof import('@/integrations/api/instance/sealedOperation')>()),
	runSealedOperation: (...args: unknown[]) => runSealedOperation(...args),
}));
const fetchClusterKey = vi.fn();
vi.mock('@/integrations/api/instance/secrets/secrets', () => ({
	secretsPublicKeyQueryOptions: (params: { entityId: string; managedClusterId?: string }) => ({
		queryKey: [params.entityId, 'get_secrets_public_key', params.managedClusterId ?? 'node'],
		queryFn: () => fetchClusterKey(params),
		retry: false,
	}),
}));

import { resetPasswordUpdater } from '@/features/cluster/queries/resetPasswordUpdater';
import { SealedOperationError } from '@/integrations/api/instance/sealedOperation';
import { onAddUserSubmit } from './addUser';
import { onAlterUser } from './alterUser';
import { onDeleteUser } from './deleteUser';
import { getListUsers } from './getListUsers';
import { onInstanceLogoutSubmit } from './onInstanceLogoutSubmit';
import { useInstanceResetPasswordMutation } from './useInstanceResetPasswordMutation';

const OWNER = 'owner@example.com';
const CLUSTER_URL = 'https://clu-1.example.com:9925/';
const INSTANCE_URL = 'https://ins-1.example.com:9925/';
const CLUSTER_KEY = { publicKey: '-----BEGIN PUBLIC KEY-----\nMIIB\n-----END PUBLIC KEY-----\n', fingerprint: 'fp-1' };

function localUser(username: string, superUser = true, active = true): LocalUser {
	return {
		active,
		username,
		role: {
			id: 'r1',
			role: superUser ? 'super_user' : 'reader',
			permission: { super_user: superUser },
			__createdtime__: 0,
			__updatedtime__: 0,
		},
		__createdtime__: 0,
		__updatedtime__: 0,
	};
}

/** A failed request as axios rejects it; no `status` is a network error. */
function failedRequest(status?: number, operation = 'login', data?: Record<string, unknown>) {
	const config = { data: JSON.stringify({ operation }), headers: new AxiosHeaders() };
	if (status === undefined) {
		return new AxiosError('Network Error', AxiosError.ERR_NETWORK, config);
	}
	return new AxiosError(`Request failed with status code ${status}`, AxiosError.ERR_BAD_REQUEST, config, undefined, {
		status,
		statusText: '',
		data: data ?? { error: status === 401 ? 'Login failed' : 'Unavailable' },
		headers: {},
		config,
	});
}

const refusedLogin = () => failedRequest(401);

function conflict(error: string) {
	const config = { data: JSON.stringify({ operation: 'add_user' }), headers: new AxiosHeaders() };
	return new AxiosError('Request failed with status code 409', AxiosError.ERR_BAD_REQUEST, config, undefined, {
		status: 409,
		statusText: 'Conflict',
		data: { error },
		headers: {},
		config,
	});
}

/**
 * A 5.4 node as the sealed path sees it. Every proxied request runs as the record-less `local` super user; a token
 * mint with credentials checks them and names that user, and one without names the first active stored super user.
 */
class SealedNode {
	readonly tokenPrefix = 'token:';
	users = new Map<string, { password?: string; superUser: boolean; active: boolean }>();
	operations: string[] = [];
	clients: AxiosInstance[] = [];
	/** Runs while a token's `user_info` is in flight, once. */
	beforeUserInfo?: () => Promise<void>;

	reset() {
		this.users = new Map([[defaultClusterUsername, { superUser: true, active: true }]]);
		this.operations = [];
		this.clients = [];
		this.beforeUserInfo = undefined;
	}

	userInfo(username: string): LocalUser {
		const user = this.users.get(username);
		if (!user) {
			throw failedRequest(401, 'user_info');
		}
		return localUser(username, user.superUser, user.active);
	}

	async run(
		{ op, instanceClient }: { op: Record<string, unknown> & { operation: string }; instanceClient: AxiosInstance },
	) {
		this.operations.push(op.operation);
		this.clients.push(instanceClient);
		const result = this.execute(op);
		if (result.status >= 400) {
			throw new SealedOperationError(op.operation, result);
		}
		return result;
	}

	execute(op: Record<string, unknown> & { operation: string }): { status: number; body: unknown } {
		const username = op.username as string;
		switch (op.operation) {
			case 'add_user':
				if (this.users.has(username)) {
					return { status: 409, body: { error: `User ${username} already exists` } };
				}
				this.users.set(username, {
					password: op.password as string,
					superUser: op.role === 'super_user',
					active: true,
				});
				return { status: 200, body: { message: `${username} successfully added` } };
			case 'alter_user': {
				const user = this.users.get(username);
				if (!user) {
					return { status: 404, body: { error: `User ${username} does not exist` } };
				}
				user.password = op.password as string;
				return { status: 200, body: { message: 'updated' } };
			}
			case 'drop_user':
				if (!this.users.delete(username)) {
					return { status: 404, body: { error: `User ${username} does not exist` } };
				}
				return { status: 200, body: { message: `${username} successfully deleted` } };
			case 'list_users':
				return {
					status: 200,
					body: [...this.users].map(([name, { superUser, active }]) => localUser(name, superUser, active)),
				};
			case 'create_authentication_tokens': {
				const named = username ? this.users.get(username) : undefined;
				if (username && (!named || named.password !== op.password)) {
					return { status: 401, body: { error: 'Invalid credentials' } };
				}
				const subject = username || [...this.users].find(([, user]) => user.superUser && user.active)?.[0];
				if (!subject) {
					return { status: 409, body: { error: 'No stored super user to mint a token for' } };
				}
				return {
					status: 200,
					body: { operation_token: this.tokenPrefix + subject, refresh_token: 'refresh:' + subject },
				};
			}
			default:
				return { status: 400, body: { error: `${op.operation} cannot be sealed` } };
		}
	}
}

const sealedNode = new SealedNode();

beforeEach(() => {
	vi.clearAllMocks();
	provisioningAccountDropped = false;
	ownerIsSuperUser = true;
	sealedNode.reset();
	fetchClusterKey.mockResolvedValue(CLUSTER_KEY);
	runSealedOperation.mockImplementation((params: Parameters<SealedNode['run']>[0]) => sealedNode.run(params));
	onInstanceLoginSubmit.mockReset();
	onInstanceLoginSubmit.mockImplementation(async ({ username }: { username: string }) => ({
		message: 'Login successful',
		user: localUser(username),
	}));
	vi.mocked(onDeleteUser).mockImplementation(async () => {
		provisioningAccountDropped = true;
		return { message: 'dropped' };
	});
	createInstanceAuthenticationTokens.mockImplementation(async () => ({
		operationToken: provisioningAccountDropped ? 'owner-token' : 'provisioning-token',
	}));
});

afterEach(() => {
	authStore.signOutEntitiesLocally(['clu-1', 'ins-1']);
	localStorage.clear();
});

function resetPassword(
	desiredUsername: string,
	overrides: { sealedSetup?: { keyFingerprint: string }; tempPassword?: string; clusterKeyPending?: boolean } = {},
) {
	const client = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
	const { result } = renderHook(() => useInstanceResetPasswordMutation(), {
		wrapper: ({ children }: { children: ReactNode }) => (
			<QueryClientProvider client={client}>{children}</QueryClientProvider>
		),
	});
	return result.current.mutateAsync({
		operationsUrl: CLUSTER_URL,
		signInIds: ['clu-1', 'ins-1'],
		clusterId: 'clu-1',
		initialUsername: defaultClusterUsername,
		desiredUsername,
		newPassword: 'new-password',
		tempPassword: 'temp-password',
		...overrides,
	});
}

describe(useInstanceResetPasswordMutation, () => {
	it.each([
		[
			'over a stored Basic credential, and the logout fails too',
			() => authStore.flagForBasicAuth('clu-1', { username: defaultClusterUsername, password: 'temp-password' }),
			true,
		],
		[
			'through the Fabric Connect proxy, where there is no session to log out',
			() => authStore.flagForFabricConnect('clu-1', true),
			false,
		],
	])('reports the failed step and leaves nothing signed in when setup fails %s', async (_, connect, logsOut) => {
		onInstanceLoginSubmit.mockImplementationOnce(async ({ username }: { username: string }) => {
			connect();
			return { message: 'Login successful', user: localUser(username) };
		});
		const failure = new Error('add_user refused');
		vi.mocked(onAddUserSubmit).mockRejectedValueOnce(failure);
		vi.mocked(onInstanceLogoutSubmit).mockRejectedValueOnce(new Error('logout refused'));

		await expect(resetPassword(OWNER)).rejects.toBe(failure);

		expect(vi.mocked(onInstanceLogoutSubmit).mock.calls.length > 0).toBe(logsOut);
		expect(authStore.checkForBasicAuth('clu-1')).toBeUndefined();
		expect(authStore.checkForFabricConnect('clu-1')).toBe(false);
	});

	it('resolves to the new admin, not the temporary user it deleted', async () => {
		const { user } = await resetPassword(OWNER);
		expect(onInstanceLoginSubmit).toHaveBeenCalledTimes(2);
		expect(onDeleteUser).toHaveBeenCalledWith(expect.objectContaining({ username: defaultClusterUsername }));
		expect(user?.username).toBe(OWNER);
	});

	it('resolves to the default admin when that is the user whose password was set', async () => {
		const { user } = await resetPassword(defaultClusterUsername);
		expect(onInstanceLoginSubmit).toHaveBeenCalledTimes(1);
		expect(onDeleteUser).not.toHaveBeenCalled();
		expect(user?.username).toBe(defaultClusterUsername);
	});

	describe('when an earlier attempt created the admin but never dropped the setup account', () => {
		let ownerPassword: string;

		beforeEach(() => {
			ownerPassword = 'first-password';
			vi.mocked(onAddUserSubmit).mockRejectedValueOnce(conflict(`User ${OWNER} already exists`));
			vi.mocked(getListUsers).mockResolvedValue([
				localUser(defaultClusterUsername),
				localUser(OWNER, ownerIsSuperUser),
			]);
			onInstanceLoginSubmit.mockImplementation(
				async ({ username, password }: { username: string; password: string }) => {
					if (username === OWNER && password !== ownerPassword) {
						throw refusedLogin();
					}
					return { message: 'Login successful', user: localUser(username) };
				},
			);
			vi.mocked(onAlterUser).mockImplementation(async ({ password }) => {
				ownerPassword = password!;
				return { message: 'updated', skipped_hashes: [], txn_time: 0, update_hashes: [] };
			});
		});

		it.each([
			['matches the one it already has', 'new-password'],
			['differs from the one it already has', 'first-password'],
		])(
			'adopts it: sets the typed password as the setup account, signs in, then drops the setup account, when the form %s',
			async (_, existingPassword) => {
				ownerPassword = existingPassword;

				const { user } = await resetPassword(OWNER);

				expect(user?.username).toBe(OWNER);
				expect(onAlterUser).toHaveBeenCalledTimes(1);
				expect(vi.mocked(onAlterUser).mock.calls[0][0]).toMatchObject({ username: OWNER, password: 'new-password' });
				expect(onDeleteUser).toHaveBeenCalledWith(expect.objectContaining({ username: defaultClusterUsername }));
				expect(vi.mocked(onDeleteUser).mock.invocationCallOrder[0]).toBeGreaterThan(
					vi.mocked(onAlterUser).mock.invocationCallOrder[0],
				);
				expect(resetPasswordUpdater).toHaveBeenCalledTimes(1);
			},
		);

		it("refuses, changing nothing, when that user isn't a super user", async () => {
			vi.mocked(getListUsers).mockResolvedValue([localUser(defaultClusterUsername), localUser(OWNER, false)]);

			await expect(resetPassword(OWNER)).rejects.toThrow("already exists on this cluster but isn't a super user");

			expect(onAlterUser).not.toHaveBeenCalled();
			expect(onDeleteUser).not.toHaveBeenCalled();
			expect(resetPasswordUpdater).not.toHaveBeenCalled();
		});

		it('drops nothing when setting the password fails', async () => {
			const refused = new Error('alter_user refused');
			vi.mocked(onAlterUser).mockRejectedValueOnce(refused);

			await expect(resetPassword(OWNER)).rejects.toBe(refused);

			expect(onDeleteUser).not.toHaveBeenCalled();
			expect(resetPasswordUpdater).not.toHaveBeenCalled();
		});

		it('treats no other add_user conflict as an existing admin', async () => {
			vi.mocked(onAddUserSubmit).mockReset();
			const duplicateRoles = conflict('Multiple roles found with the name super_user');
			vi.mocked(onAddUserSubmit).mockRejectedValueOnce(duplicateRoles);

			await expect(resetPassword(OWNER)).rejects.toBe(duplicateRoles);

			expect(getListUsers).not.toHaveBeenCalled();
			expect(onDeleteUser).not.toHaveBeenCalled();
		});
	});

	it('keeps no Fabric Connect connection made before setup, and does not run on one', async () => {
		await authStore.establishFabricConnectAuth({ id: 'clu-1', operationsUrl: CLUSTER_URL });
		await authStore.establishFabricConnectAuth({ id: 'ins-1', operationsUrl: INSTANCE_URL });
		expect(authStore.getOperationToken('clu-1')).toBe('provisioning-token');

		await resetPassword(OWNER);

		expect(authStore.getOperationToken('clu-1')).toBeUndefined();
		expect(authStore.checkForFabricConnect('clu-1')).toBe(false);
		expect(authStore.getOperationToken('ins-1')).toBeUndefined();
		expect(authStore.getConnectionById('ins-1').user).toBeNull();
		const clients = [onInstanceLoginSubmit, vi.mocked(onAddUserSubmit), vi.mocked(onDeleteUser)]
			.flatMap(({ mock }) => mock.calls.map(([{ instanceClient }]) => instanceClient as AxiosInstance));
		expect(clients).toHaveLength(4);
		for (const instanceClient of clients) {
			expect(instanceClient.defaults.baseURL).toBe(CLUSTER_URL);
			expect(instanceClient.defaults.headers.Authorization).toBeUndefined();
		}
	});

	function fallBackToFabricConnectOnLogin() {
		onInstanceLoginSubmit.mockImplementation(async ({ username }: { username: string }) => {
			if (username !== defaultClusterUsername) {
				// Asked over the Bearer, `user_info` names the provisioning account, not the one that signed in.
				return { message: 'Login successful', user: localUser(defaultClusterUsername) };
			}
			const user = await authStore.establishFabricConnectAuth({ id: 'clu-1', operationsUrl: CLUSTER_URL });
			return {
				message: 'Login successful',
				user,
				instanceClient: getInstanceClient({ id: 'clu-1', operationsUrl: CLUSTER_URL }),
			};
		});
	}

	it('reconnects Fabric Connect after the drop when login had to fall back to it', async () => {
		fallBackToFabricConnectOnLogin();

		const { user } = await resetPassword(OWNER);

		expect(user?.username).toBe(OWNER);
		expect(authStore.getOperationToken('clu-1')).toBe('owner-token');
		expect(authStore.getConnectionById('clu-1').user).toMatchObject({ username: OWNER });
		expect(createInstanceAuthenticationTokens.mock.invocationCallOrder.at(-1)).toBeGreaterThan(
			vi.mocked(onDeleteUser).mock.invocationCallOrder[0],
		);
	});

	it.each([
		['the reconnect fails', () => createInstanceAuthenticationTokens.mockRejectedValueOnce(new Error('proxy down'))],
		[
			'the proxy reaches an instance the drop has not reached',
			() => createInstanceAuthenticationTokens.mockResolvedValueOnce({ operationToken: 'provisioning-token' }),
		],
	])('finishes setup signed out when %s', async (_, afterTheDrop) => {
		fallBackToFabricConnectOnLogin();
		vi.mocked(onDeleteUser).mockImplementation(async () => {
			provisioningAccountDropped = true;
			afterTheDrop();
			return { message: 'dropped' };
		});

		const { user } = await resetPassword(OWNER);

		expect(user).toBeNull();
		expect(authStore.getOperationToken('clu-1')).toBeUndefined();
		expect(authStore.checkForFabricConnect('clu-1')).toBe(false);
		expect(authStore.getConnectionById('clu-1').user).toBeNull();
	});
});

describe('an interrupted setup: the setup account is gone, the admin exists, and central manager was never told', () => {
	let ownerPassword: string;
	let answeredAs: string;
	let loginFellBackToFabricConnect: boolean;

	beforeEach(() => {
		provisioningAccountDropped = true;
		ownerPassword = 'first-password';
		answeredAs = OWNER;
		loginFellBackToFabricConnect = false;
		onInstanceLoginSubmit.mockImplementation(async ({ username, password }: { username: string; password: string }) => {
			if (username !== OWNER || password !== ownerPassword) {
				throw refusedLogin();
			}
			authStore.flagForBasicAuth('clu-1', { username, password });
			return {
				message: 'Login successful',
				user: localUser(answeredAs, ownerIsSuperUser),
				...(loginFellBackToFabricConnect ? { instanceClient: getInstanceClient({ id: 'clu-1' }) } : {}),
			};
		});
		vi.mocked(onAlterUser).mockImplementation(async ({ password }) => {
			ownerPassword = password!;
			return { message: 'updated', skipped_hashes: [], txn_time: 0, update_hashes: [] };
		});
	});

	it("finishes by signing in with the form's credentials when they still work", async () => {
		ownerPassword = 'new-password';

		const { user } = await resetPassword(OWNER);

		expect(user?.username).toBe(OWNER);
		expect(resetPasswordUpdater).toHaveBeenCalledTimes(1);
		expect(createInstanceAuthenticationTokens).not.toHaveBeenCalled();
		expect(onAddUserSubmit).not.toHaveBeenCalled();
		expect(onAlterUser).not.toHaveBeenCalled();
		expect(onDeleteUser).not.toHaveBeenCalled();
	});

	it.each([
		[
			'as a user who is not a super user',
			() => {
				ownerIsSuperUser = false;
			},
			"doesn't report it as a super user",
		],
		[
			'but the answer names someone else',
			() => {
				answeredAs = defaultClusterUsername;
			},
			'answered as "HDB_ADMIN"',
		],
	])("does not finish when the form's credentials sign in %s", async (_, arrange, message) => {
		ownerPassword = 'new-password';
		arrange();

		await expect(resetPassword(OWNER)).rejects.toThrow(message);

		expect(resetPasswordUpdater).not.toHaveBeenCalled();
		expect(authStore.checkForBasicAuth('clu-1')).toBeUndefined();
	});

	it.each([
		[
			"the PATCH fails after the form's credentials signed in",
			() => {
				ownerPassword = 'new-password';
				vi.mocked(resetPasswordUpdater).mockRejectedValueOnce(new Error('central manager down'));
			},
		],
		[
			'alter_user fails after Fabric Connect connected',
			() => vi.mocked(onAlterUser).mockRejectedValueOnce(new Error('alter refused')),
		],
	])('leaves nothing signed in when %s', async (_, arrange) => {
		arrange();

		await expect(resetPassword(OWNER)).rejects.toThrow();

		expect(authStore.checkForBasicAuth('clu-1')).toBeUndefined();
		expect(authStore.getOperationToken('clu-1')).toBeUndefined();
		expect(authStore.checkForFabricConnect('clu-1')).toBe(false);
		expect(authStore.getConnectionById('clu-1').user).toBeNull();
	});

	it('finishes through Fabric Connect, sets the typed password, then signs in directly', async () => {
		const { user } = await resetPassword(OWNER);

		expect(user?.username).toBe(OWNER);
		expect(onAlterUser).toHaveBeenCalledTimes(1);
		const [{ username, password, instanceClient }] = vi.mocked(onAlterUser).mock.calls[0];
		expect({ username, password }).toEqual({ username: OWNER, password: 'new-password' });
		expect(instanceClient.defaults.headers.Authorization).toBe('Bearer owner-token');
		expect(resetPasswordUpdater).toHaveBeenCalledTimes(1);
		expect(vi.mocked(resetPasswordUpdater).mock.invocationCallOrder[0]).toBeGreaterThan(
			vi.mocked(onAlterUser).mock.invocationCallOrder[0],
		);
		expect(authStore.checkForFabricConnect('clu-1')).toBe(false);
		expect(authStore.getOperationToken('clu-1')).toBeUndefined();
	});

	it('finishes signed out when the direct sign-in falls back to a Fabric Connect that names someone else', async () => {
		vi.mocked(onAlterUser).mockImplementationOnce(async ({ password }) => {
			ownerPassword = password!;
			answeredAs = defaultClusterUsername;
			loginFellBackToFabricConnect = true;
			return { message: 'updated', skipped_hashes: [], txn_time: 0, update_hashes: [] };
		});

		const { user } = await resetPassword(OWNER);

		expect(user).toBeNull();
		expect(resetPasswordUpdater).toHaveBeenCalledTimes(1);
		expect(authStore.checkForFabricConnect('clu-1')).toBe(false);
		expect(authStore.getConnectionById('clu-1').user).toBeNull();
	});

	it.each([
		[
			'Fabric Connect still resolves to the setup account',
			() => {
				provisioningAccountDropped = false;
			},
			OWNER,
			'Fabric Connect signs in as "HDB_ADMIN"',
		],
		[
			'Fabric Connect resolves to a user that is not a super user',
			() => {
				ownerIsSuperUser = false;
			},
			OWNER,
			`Fabric Connect signs in as "${OWNER}"`,
		],
		['the form names a different admin than the one setup created', () => {}, 'someone@example.com', `"${OWNER}"`],
	])('refuses to finish when %s', async (_, arrange, desiredUsername, message) => {
		arrange();

		await expect(resetPassword(desiredUsername)).rejects.toThrow(message);

		expect(onAlterUser).not.toHaveBeenCalled();
		expect(resetPasswordUpdater).not.toHaveBeenCalled();
		expect(authStore.getOperationToken('clu-1')).toBeUndefined();
		expect(authStore.checkForFabricConnect('clu-1')).toBe(false);
	});

	it('says what happened when Fabric Connect is unavailable', async () => {
		const unreachable = new Error('proxy down');
		createInstanceAuthenticationTokens.mockRejectedValueOnce(unreachable);

		const failure = await resetPassword(OWNER).then(() => undefined, (error: unknown) => error as Error);

		expect(failure?.message).toContain("Fabric Connect couldn't reach the cluster");
		expect(failure?.message).toContain('contact support');
		expect(failure?.cause).toBe(unreachable);
		expect(resetPasswordUpdater).not.toHaveBeenCalled();
	});

	it.each([
		['a 5xx from login', () => failedRequest(503)],
		['a network error on login', () => failedRequest()],
		["a 401 from a request that isn't login", () => failedRequest(401, 'create_authentication_tokens')],
	])('does not take the recovery path, or hide the error, on %s', async (_, failure) => {
		const original = failure();
		onInstanceLoginSubmit.mockRejectedValueOnce(original);
		vi.mocked(onInstanceLogoutSubmit).mockRejectedValueOnce(new Error('logout refused'));

		await expect(resetPassword(OWNER)).rejects.toBe(original);

		expect(onInstanceLoginSubmit).toHaveBeenCalledTimes(1);
		expect(createInstanceAuthenticationTokens).not.toHaveBeenCalled();
		expect(resetPasswordUpdater).not.toHaveBeenCalled();
	});
});

describe('sealed setup on a 5.4.0+ cluster', () => {
	const SEALED = { sealedSetup: { keyFingerprint: 'fp-1' }, tempPassword: undefined };
	const sealed = (desiredUsername: string) => resetPassword(desiredUsername, SEALED);

	function expectNothingDirect() {
		expect(onInstanceLoginSubmit).not.toHaveBeenCalled();
		expect(onAddUserSubmit).not.toHaveBeenCalled();
		expect(onAlterUser).not.toHaveBeenCalled();
		expect(onDeleteUser).not.toHaveBeenCalled();
		expect(createInstanceAuthenticationTokens).not.toHaveBeenCalled();
	}

	function expectNothingSignedIn() {
		expect(authStore.getOperationToken('clu-1')).toBeUndefined();
		expect(authStore.checkForFabricConnect('clu-1')).toBe(false);
		expect(authStore.getConnectionById('clu-1').user).toBeNull();
	}

	it("seals the admin, proves its sign-in with the admin's own tokens, drops the provisioning account, tells central manager, then connects", async () => {
		const { user } = await sealed(OWNER);

		expect(user?.username).toBe(OWNER);
		expect(sealedNode.operations).toEqual(['add_user', 'create_authentication_tokens', 'drop_user']);
		expect(vi.mocked(resetPasswordUpdater).mock.invocationCallOrder[0]).toBeGreaterThan(
			runSealedOperation.mock.invocationCallOrder.at(-1)!,
		);
		expect(fetchClusterKey).toHaveBeenCalledWith(
			expect.objectContaining({ entityId: 'clu-1', managedClusterId: 'clu-1' }),
		);
		expect(runSealedOperation.mock.calls.map(([{ op }]) => op)).toEqual([
			{ operation: 'add_user', username: OWNER, password: 'new-password', role: 'super_user', active: true },
			{ operation: 'create_authentication_tokens', username: OWNER, password: 'new-password' },
			{ operation: 'drop_user', username: defaultClusterUsername },
		]);
		expect(runSealedOperation.mock.calls[0][0]).toMatchObject({ key: CLUSTER_KEY });
		for (const instanceClient of sealedNode.clients) {
			expect(instanceClient.defaults.baseURL).toContain('/Cluster/clu-1/operation');
		}
		expect(sealedNode.users.has(defaultClusterUsername)).toBe(false);
		expect(authStore.getOperationToken('clu-1')).toBe(`token:${OWNER}`);
		expect(authStore.getConnectionById('clu-1').user).toMatchObject({ username: OWNER });
		expectNothingDirect();
	});

	it('sets the password of the provisioning account instead when the form names it, and drops nothing', async () => {
		const { user } = await sealed(defaultClusterUsername);

		expect(user?.username).toBe(defaultClusterUsername);
		expect(sealedNode.operations).toEqual(['alter_user', 'create_authentication_tokens']);
		expect(sealedNode.users.get(defaultClusterUsername)?.password).toBe('new-password');
		expect(resetPasswordUpdater).toHaveBeenCalledTimes(1);
		expectNothingDirect();
	});

	it('adopts an admin an earlier attempt created, once it is an active super user', async () => {
		sealedNode.users.set(OWNER, { password: 'first-password', superUser: true, active: true });

		const { user } = await sealed(OWNER);

		expect(user?.username).toBe(OWNER);
		expect(sealedNode.operations).toEqual([
			'add_user',
			'list_users',
			'alter_user',
			'create_authentication_tokens',
			'drop_user',
		]);
		expect(sealedNode.users.get(OWNER)?.password).toBe('new-password');
		expect(resetPasswordUpdater).toHaveBeenCalledTimes(1);
	});

	it.each([
		['not a super user', { superUser: false, active: true }],
		['inactive', { superUser: true, active: false }],
	])('refuses, changing nothing, when the user that exists is %s', async (_, state) => {
		sealedNode.users.set(OWNER, { password: 'first-password', ...state });

		await expect(sealed(OWNER)).rejects.toThrow("already exists on this cluster but isn't an active super user");

		expect(sealedNode.operations).toEqual(['add_user', 'list_users']);
		expect(sealedNode.users.has(defaultClusterUsername)).toBe(true);
		expect(resetPasswordUpdater).not.toHaveBeenCalled();
	});

	it('finishes when an earlier attempt already dropped the provisioning account and never told central manager', async () => {
		sealedNode.users.delete(defaultClusterUsername);
		sealedNode.users.set(OWNER, { password: 'first-password', superUser: true, active: true });

		const { user } = await sealed(OWNER);

		expect(user?.username).toBe(OWNER);
		expect(sealedNode.operations).toEqual([
			'add_user',
			'list_users',
			'alter_user',
			'create_authentication_tokens',
			'drop_user',
		]);
		expect(resetPasswordUpdater).toHaveBeenCalledTimes(1);
	});

	it("mints for the form's admin and no other super user another attempt may have left", async () => {
		sealedNode.users.set('alice@example.com', { password: 'alice', superUser: true, active: true });

		const { user } = await sealed(OWNER);

		expect(user?.username).toBe(OWNER);
		expect(authStore.getOperationToken('clu-1')).toBe(`token:${OWNER}`);
	});

	it.each([
		[
			'the node holds no custody',
			() =>
				runSealedOperation.mockRejectedValueOnce(
					failedRequest(503, 'encrypted_operation', { error: 'secrets custody is not initialized on this node' }),
				),
		],
		[
			'the envelope is refused',
			() =>
				runSealedOperation.mockRejectedValueOnce(
					failedRequest(400, 'encrypted_operation', { error: 'The envelope could not be decrypted' }),
				),
		],
	])(
		'surfaces the refusal, changes nothing, and never falls back to a plaintext request when %s',
		async (_, arrange) => {
			arrange();

			await expect(sealed(OWNER)).rejects.toThrow();

			expect(sealedNode.users.has(defaultClusterUsername)).toBe(true);
			expect(resetPasswordUpdater).not.toHaveBeenCalled();
			expectNothingSignedIn();
			expectNothingDirect();
		},
	);

	it('does not drop the provisioning account when the admin cannot sign in', async () => {
		runSealedOperation.mockImplementation(async (params: Parameters<SealedNode['run']>[0]) => {
			if (params.op.operation === 'create_authentication_tokens') {
				throw new SealedOperationError(params.op.operation, { status: 401, body: { error: 'Invalid credentials' } });
			}
			return sealedNode.run(params);
		});

		await expect(sealed(OWNER)).rejects.toThrow('Invalid credentials');

		expect(sealedNode.operations).toEqual(['add_user']);
		expect(sealedNode.users.has(defaultClusterUsername)).toBe(true);
		expect(resetPasswordUpdater).not.toHaveBeenCalled();
	});

	it('surfaces a drop that fails and sends no PATCH, so a retry can finish', async () => {
		runSealedOperation.mockImplementation(async (params: Parameters<SealedNode['run']>[0]) => {
			if (params.op.operation === 'drop_user') {
				throw failedRequest(502, 'encrypted_operation', { error: 'Bad gateway' });
			}
			return sealedNode.run(params);
		});

		await expect(sealed(OWNER)).rejects.toThrow();
		expect(resetPasswordUpdater).not.toHaveBeenCalled();

		runSealedOperation.mockImplementation((params: Parameters<SealedNode['run']>[0]) => sealedNode.run(params));
		const { user } = await sealed(OWNER);

		expect(user?.username).toBe(OWNER);
		expect(sealedNode.users.has(defaultClusterUsername)).toBe(false);
		expect(resetPasswordUpdater).toHaveBeenCalledTimes(1);
	});

	it('keeps a connection that replaced its own while it was connecting, finishing without a user', async () => {
		const signOut = vi.spyOn(authStore, 'signOutLocally');
		sealedNode.beforeUserInfo = async () => {
			sealedNode.beforeUserInfo = undefined;
			await authStore.establishFabricConnectAuth({ id: 'clu-1', operationsUrl: CLUSTER_URL });
		};

		const { user } = await sealed(OWNER);

		expect(user).toBeNull();
		expect(resetPasswordUpdater).toHaveBeenCalledTimes(1);
		expect(signOut.mock.calls.map(([id]) => id)).toEqual(['clu-1', 'ins-1']);
		expect(authStore.getOperationToken('clu-1')).toBe('provisioning-token');
		expect(authStore.getConnectionById('clu-1').user).toMatchObject({ username: defaultClusterUsername });
	});

	it('says the key is still on its way when a 5.4 cluster has no temporary password and no key on every member', async () => {
		await expect(resetPassword(OWNER, { tempPassword: undefined, clusterKeyPending: true })).rejects.toThrow(
			"hasn't reported every member's Harper version and secrets key yet",
		);
		await expect(resetPassword(OWNER, { tempPassword: undefined })).rejects.toThrow('may not have permission');
		expect(onInstanceLoginSubmit).not.toHaveBeenCalled();
	});

	it('finishes signed out, after telling central manager, when the cluster cannot be reached directly', async () => {
		runSealedOperation.mockImplementation(async (params: Parameters<SealedNode['run']>[0]) => {
			const result = await sealedNode.run(params);
			return params.op.operation === 'create_authentication_tokens'
				? { ...result, body: { operation_token: 'token:unreachable', refresh_token: 'r' } }
				: result;
		});

		const signOut = vi.spyOn(authStore, 'signOutLocally');
		const { user } = await sealed(OWNER);

		expect(user).toBeNull();
		expect(resetPasswordUpdater).toHaveBeenCalledTimes(1);
		expect(createInstanceAuthenticationTokens).not.toHaveBeenCalled();
		expect(signOut.mock.calls.map(([id]) => id)).toEqual(['clu-1', 'ins-1']);
		expectNothingSignedIn();
	});

	it('leaves the admin unconnected when a sign-out lands during setup, keeping no token in a signed-out tab', async () => {
		vi.mocked(resetPasswordUpdater).mockImplementationOnce(async () => {
			authStore.signOutLocally('clu-1');
		});

		const { user } = await sealed(OWNER);

		expect(user).toBeNull();
		expect(sealedNode.users.has(defaultClusterUsername)).toBe(false);
		expectNothingSignedIn();
	});

	it('refetches a key whose fingerprint is not the one the members hold, and refuses one that stays different', async () => {
		fetchClusterKey.mockResolvedValueOnce({ ...CLUSTER_KEY, fingerprint: 'fp-0' });
		const { user } = await sealed(OWNER);
		expect(user?.username).toBe(OWNER);
		expect(fetchClusterKey).toHaveBeenCalledTimes(2);

		sealedNode.reset();
		fetchClusterKey.mockResolvedValue({ ...CLUSTER_KEY, fingerprint: 'fp-0' });
		await expect(sealed(OWNER)).rejects.toThrow('not the one its members hold');
		expect(sealedNode.operations).toEqual([]);
	});

	it('surfaces a failure to fetch the key rather than falling back to the temporary password', async () => {
		const outage = failedRequest(503, 'get_secrets_public_key');
		fetchClusterKey.mockRejectedValueOnce(outage);

		await expect(sealed(OWNER)).rejects.toBe(outage);

		expect(runSealedOperation).not.toHaveBeenCalled();
		expectNothingDirect();
	});

	it('never looks for the key, or seals anything, below 5.4.0', async () => {
		await resetPassword(OWNER);

		expect(fetchClusterKey).not.toHaveBeenCalled();
		expect(runSealedOperation).not.toHaveBeenCalled();
	});
});
