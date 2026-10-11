/** @vitest-environment jsdom */
import { defaultClusterUsername } from '@/config/constants';
import type { LocalUser } from '@/integrations/api/api.patch';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import type { AxiosInstance } from 'axios';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const onInstanceLoginSubmit = vi.fn();
vi.mock('./useInstanceLoginMutation', () => ({
	onInstanceLoginSubmit: (...args: unknown[]) => onInstanceLoginSubmit(...args),
}));
vi.mock('./addUser', () => ({ onAddUserSubmit: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./alterUser', () => ({ onAlterUser: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./deleteUser', () => ({ onDeleteUser: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./onInstanceLogoutSubmit', () => ({ onInstanceLogoutSubmit: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/features/cluster/queries/resetPasswordUpdater', () => ({
	resetPasswordUpdater: vi.fn().mockResolvedValue(undefined),
}));

import { onDeleteUser } from './deleteUser';
import { useInstanceResetPasswordMutation } from './useInstanceResetPasswordMutation';

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
	onInstanceLoginSubmit.mockReset();
	onInstanceLoginSubmit.mockImplementation(async ({ username }: { username: string }) => ({
		message: 'Login successful',
		user: localUser(username),
	}));
});

function resetPassword(desiredUsername: string) {
	const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
	const { result } = renderHook(() => useInstanceResetPasswordMutation(), {
		wrapper: ({ children }: { children: ReactNode }) => (
			<QueryClientProvider client={client}>{children}</QueryClientProvider>
		),
	});
	return result.current.mutateAsync({
		instanceClient: {} as AxiosInstance,
		clusterId: 'clu-1',
		initialUsername: defaultClusterUsername,
		desiredUsername,
		newPassword: 'new-password',
		tempPassword: 'temp-password',
	});
}

describe(useInstanceResetPasswordMutation, () => {
	it('resolves to the new admin, not the temporary user it deleted', async () => {
		const { user } = await resetPassword('owner@example.com');
		expect(onInstanceLoginSubmit).toHaveBeenCalledTimes(2);
		expect(onDeleteUser).toHaveBeenCalledWith(expect.objectContaining({ username: defaultClusterUsername }));
		expect(user.username).toBe('owner@example.com');
	});

	it('resolves to the default admin when that is the user whose password was set', async () => {
		const { user } = await resetPassword(defaultClusterUsername);
		expect(onInstanceLoginSubmit).toHaveBeenCalledTimes(1);
		expect(onDeleteUser).not.toHaveBeenCalled();
		expect(user.username).toBe(defaultClusterUsername);
	});
});
