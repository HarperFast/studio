/** @vitest-environment jsdom */
import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock('@/config/apiClient', () => ({ apiClient: { post, defaults: { baseURL: 'https://cm.example.com' } } }));
vi.mock('@tanstack/react-router', () => ({ useParams: () => ({}) }));

import { authStore, OverallAppSignIn } from '@/features/auth/store/authStore';
import { queryClient } from '@/react-query/queryClient';
import { useLogoutMutation } from './useLogout';

type SetArgs = Parameters<typeof authStore.setUserForIdAndKey>;

function wrapper({ children }: PropsWithChildren) {
	return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('useLogoutMutation', () => {
	beforeEach(() => {
		localStorage.clear();
		sessionStorage.clear();
		queryClient.clear();
		post.mockReset();
	});

	it('clears both caches and still runs the caller onSuccess that redirects to sign-in', async () => {
		authStore.setUserForIdAndKey(OverallAppSignIn, OverallAppSignIn, { id: 'usr_a' } as SetArgs[2]);
		queryClient.setQueryData(['previous-user-data'], { secret: true });
		queryClient.getMutationCache().build(queryClient, { mutationKey: ['previous-user-mutation'] });
		post.mockResolvedValue({ data: {} });
		const onSuccess = vi.fn();
		const { result } = renderHook(() => useLogoutMutation(), { wrapper });

		act(() => result.current.mutate(undefined, { onSuccess }));

		await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
		expect(post).toHaveBeenCalledWith('/Logout/');
		expect(queryClient.getQueryCache().getAll()).toEqual([]);
		expect(queryClient.getMutationCache().getAll()).toEqual([]);
		expect(authStore.getConnectionById(OverallAppSignIn).user).toBeNull();
	});

	it('still reaches the caller onSuccess when localStorage refuses to clear', async () => {
		authStore.setUserForIdAndKey(OverallAppSignIn, OverallAppSignIn, { id: 'usr_a' } as SetArgs[2]);
		post.mockResolvedValue({ data: {} });
		const clear = Storage.prototype.clear;
		const clearSpy = vi.spyOn(Storage.prototype, 'clear').mockImplementation(function(this: Storage) {
			if (this === localStorage) {
				throw new DOMException('Storage refused.', 'SecurityError');
			}
			clear.call(this);
		});
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const onSuccess = vi.fn();
		const { result } = renderHook(() => useLogoutMutation(), { wrapper });

		try {
			act(() => result.current.mutate(undefined, { onSuccess }));
			await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
		} finally {
			clearSpy.mockRestore();
			consoleError.mockRestore();
		}
		expect(authStore.getConnectionById(OverallAppSignIn).user).toBeNull();
	});
});
