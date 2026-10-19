/** @vitest-environment jsdom */
import { defaultClusterUsername } from '@/config/constants';
import { getInstanceClient } from '@/config/getInstanceClient';
import { authStore } from '@/features/auth/store/authStore';
import type { LocalUser } from '@/integrations/api/api.patch';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import type { AxiosInstance } from 'axios';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const onInstanceLoginSubmit = vi.fn();
vi.mock('./useInstanceLoginMutation', () => ({
	onInstanceLoginSubmit: (...args: unknown[]) => onInstanceLoginSubmit(...args),
}));
vi.mock('./addUser', () => ({ onAddUserSubmit: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./alterUser', () => ({ onAlterUser: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./deleteUser', () => ({ onDeleteUser: vi.fn() }));
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
vi.mock('@/integrations/api/instance/status/getInstanceUserInfo', () => ({
	getInstanceUserInfo: async ({ instanceClient }: { instanceClient: AxiosInstance }) =>
		localUser(instanceClient.defaults.headers.Authorization === 'Bearer owner-token' ? OWNER : defaultClusterUsername),
}));

import { onAddUserSubmit } from './addUser';
import { onDeleteUser } from './deleteUser';
import { useInstanceResetPasswordMutation } from './useInstanceResetPasswordMutation';

const OWNER = 'owner@example.com';
const CLUSTER_URL = 'https://clu-1.example.com:9925/';
const INSTANCE_URL = 'https://ins-1.example.com:9925/';

function localUser(username: string): LocalUser {
	return {
		active: true,
		username,
		role: { id: 'r1', role: 'super_user', permission: { super_user: true }, __createdtime__: 0, __updatedtime__: 0 },
		__createdtime__: 0,
		__updatedtime__: 0,
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	provisioningAccountDropped = false;
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

function resetPassword(desiredUsername: string) {
	const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
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
	});
}

describe(useInstanceResetPasswordMutation, () => {
	it('resolves to the new admin, not the temporary user it deleted', async () => {
		const { user } = await resetPassword(OWNER);
		expect(onInstanceLoginSubmit).toHaveBeenCalledTimes(2);
		expect(onDeleteUser).toHaveBeenCalledWith(expect.objectContaining({ username: defaultClusterUsername }));
		expect(user.username).toBe(OWNER);
	});

	it('resolves to the default admin when that is the user whose password was set', async () => {
		const { user } = await resetPassword(defaultClusterUsername);
		expect(onInstanceLoginSubmit).toHaveBeenCalledTimes(1);
		expect(onDeleteUser).not.toHaveBeenCalled();
		expect(user.username).toBe(defaultClusterUsername);
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

	it('reconnects Fabric Connect after the drop when login had to fall back to it', async () => {
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

		const { user } = await resetPassword(OWNER);

		expect(user.username).toBe(OWNER);
		expect(authStore.getOperationToken('clu-1')).toBe('owner-token');
		expect(authStore.getConnectionById('clu-1').user).toMatchObject({ username: OWNER });
		expect(createInstanceAuthenticationTokens.mock.invocationCallOrder.at(-1)).toBeGreaterThan(
			vi.mocked(onDeleteUser).mock.invocationCallOrder[0],
		);
	});
});
