/** @vitest-environment jsdom */
import { authStore } from '@/features/auth/store/authStore';
import type { LocalUser } from '@/integrations/api/api.patch';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import type { AxiosInstance } from 'axios';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getInstanceUserInfo = vi.fn();
vi.mock('@/integrations/api/instance/status/getInstanceUserInfo', () => ({
	getInstanceUserInfo: (...args: unknown[]) => getInstanceUserInfo(...args),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { onInstanceLoginSubmit, SignedOutDuringLoginError, useInstanceLoginMutation } from './useInstanceLoginMutation';

const ENTITY = 'clu-login';
const owner = { username: 'owner@example.com' } as LocalUser;

/** A client whose `login` succeeds; `duringLogin` runs while that request is in flight. */
function clientSigningOutDuring(duringLogin: () => void): AxiosInstance {
	return {
		defaults: { baseURL: 'https://clu-login.example.com:9925/' },
		post: vi.fn(async () => {
			duringLogin();
			return { data: { message: 'Login successful' } };
		}),
	} as unknown as AxiosInstance;
}

beforeEach(() => {
	getInstanceUserInfo.mockReset();
});

afterEach(() => {
	authStore.signOutEntitiesLocally([ENTITY]);
	localStorage.clear();
});

describe('a sign-out while signing in', () => {
	it.each([
		['the cookie check answers', () => getInstanceUserInfo.mockResolvedValue(owner)],
		[
			'only Basic auth answers',
			() => getInstanceUserInfo.mockRejectedValueOnce(new Error('no session')).mockResolvedValue(owner),
		],
	])('records nothing when %s', async (_, arrange) => {
		arrange();
		const instanceClient = clientSigningOutDuring(() => authStore.signOutAllLocally());

		await expect(
			onInstanceLoginSubmit({ username: 'owner@example.com', password: 'secret', instanceClient, entityId: ENTITY }),
		).rejects.toBeInstanceOf(SignedOutDuringLoginError);

		expect(authStore.checkForBasicAuth(ENTITY)).toBeUndefined();
		expect(authStore.getLastConnectMode(ENTITY)).toBeUndefined();
	});

	it('also refuses when the sign-out lands during the user lookup, and one of this entity is enough', async () => {
		getInstanceUserInfo.mockRejectedValueOnce(new Error('no session')).mockImplementation(async () => {
			authStore.signOutLocally(ENTITY);
			return owner;
		});

		await expect(
			onInstanceLoginSubmit({
				username: 'owner@example.com',
				password: 'secret',
				instanceClient: clientSigningOutDuring(() => {}),
				entityId: ENTITY,
			}),
		).rejects.toBeInstanceOf(SignedOutDuringLoginError);

		expect(authStore.checkForBasicAuth(ENTITY)).toBeUndefined();
	});

	it('fails the sign-in page mutation instead of signing in', async () => {
		getInstanceUserInfo.mockRejectedValueOnce(new Error('no session')).mockResolvedValue(owner);
		const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
		const { result } = renderHook(() => useInstanceLoginMutation(), {
			wrapper: ({ children }: { children: ReactNode }) => (
				<QueryClientProvider client={client}>{children}</QueryClientProvider>
			),
		});

		await expect(
			result.current.mutateAsync({
				username: 'owner@example.com',
				password: 'secret',
				instanceClient: clientSigningOutDuring(() => authStore.signOutAllLocally()),
				entityId: ENTITY,
			}),
		).rejects.toBeInstanceOf(SignedOutDuringLoginError);

		expect(authStore.checkForBasicAuth(ENTITY)).toBeUndefined();
	});

	it('still records a sign-in nobody interrupted', async () => {
		getInstanceUserInfo.mockRejectedValueOnce(new Error('no session')).mockResolvedValue(owner);

		const { user } = await onInstanceLoginSubmit({
			username: 'owner@example.com',
			password: 'secret',
			instanceClient: clientSigningOutDuring(() => {}),
			entityId: ENTITY,
		});

		expect(user).toBe(owner);
		expect(authStore.checkForBasicAuth(ENTITY)).toEqual({ username: 'owner@example.com', password: 'secret' });
		expect(authStore.getLastConnectMode(ENTITY)).toBe('direct');
	});
});
