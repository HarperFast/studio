/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { del, patch, post } = vi.hoisted(() => ({ del: vi.fn(), patch: vi.fn(), post: vi.fn() }));
vi.mock('@/config/apiClient', () => ({ apiClient: { delete: del, patch, post } }));

import { useRevokeOrganizationApiTokenMutation } from './revokeOrganizationApiToken';
import {
	useCreateServiceAccountMutation,
	useDeleteServiceAccountMutation,
	useUpdateServiceAccountMutation,
} from './serviceAccounts';

const withClient = (client: QueryClient) => ({ children }: { children: ReactNode }) =>
	createElement(QueryClientProvider, { client }, children);

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((res) => {
		resolve = res;
	});
	return { promise, resolve };
}

// The page that started a mutation may be gone by the time it settles; the cache must still follow it.
describe('service-account mutations keep the cache current after their page unmounts', () => {
	beforeEach(() => {
		del.mockReset();
		patch.mockReset();
	});

	it('update writes the returned account into the list and refreshes it', async () => {
		const response = deferred<{ data: object }>();
		patch.mockReturnValue(response.promise);
		const client = new QueryClient();
		client.setQueryData(['org-1', 'serviceAccounts'], [{ id: 'sva-1', status: 'ACTIVE' }, {
			id: 'sva-2',
			status: 'ACTIVE',
		}]);
		const invalidate = vi.spyOn(client, 'invalidateQueries');
		const { result, unmount } = renderHook(() => useUpdateServiceAccountMutation('org-1'), {
			wrapper: withClient(client),
		});
		act(() => result.current.mutate({ id: 'sva-1', status: 'DISABLED' }));
		unmount();
		response.resolve({ data: { id: 'sva-1', status: 'DISABLED' } });
		await waitFor(() =>
			expect(invalidate).toHaveBeenCalledWith({ queryKey: ['org-1', 'serviceAccounts'], exact: true })
		);
		expect(client.getQueryData(['org-1', 'serviceAccounts'])).toEqual([
			{ id: 'sva-1', status: 'DISABLED' },
			{ id: 'sva-2', status: 'ACTIVE' },
		]);
	});

	it('create lists the new account at once, so it can be selected before the refetch lands', async () => {
		post.mockResolvedValue({ data: { id: 'sva-new', name: 'nightly-sync' } });
		const client = new QueryClient();
		client.setQueryData(['org-1', 'serviceAccounts'], [{ id: 'sva-1' }]);
		vi.spyOn(client, 'invalidateQueries').mockResolvedValue();
		const { result } = renderHook(() => useCreateServiceAccountMutation('org-1'), { wrapper: withClient(client) });
		await act(async () => {
			await result.current.mutateAsync({ organizationId: 'org-1', name: 'nightly-sync', roleId: 'rol-ci' });
		});
		expect(client.getQueryData(['org-1', 'serviceAccounts'])).toEqual([
			{ id: 'sva-1' },
			{ id: 'sva-new', name: 'nightly-sync' },
		]);
	});

	it('settles without waiting for the refetch it starts', async () => {
		patch.mockResolvedValue({ data: { id: 'sva-1', status: 'DISABLED' } });
		const client = new QueryClient();
		client.setQueryData(['org-1', 'serviceAccounts'], []);
		vi.spyOn(client, 'invalidateQueries').mockReturnValue(new Promise(() => undefined));
		const { result } = renderHook(() => useUpdateServiceAccountMutation('org-1'), { wrapper: withClient(client) });
		let updated: unknown;
		await act(async () => {
			updated = await result.current.mutateAsync({ id: 'sva-1', status: 'DISABLED' });
		});
		expect(updated).toEqual({ id: 'sva-1', status: 'DISABLED' });
	});

	it('delete refreshes the list, leaving the account’s own queries to the page that still shows them', async () => {
		const response = deferred<{ data: object }>();
		del.mockReturnValue(response.promise);
		const client = new QueryClient();
		client.setQueryData(['org-1', 'serviceAccounts', 'sva-1'], { id: 'sva-1' });
		client.setQueryData(['org-1', 'apiTokens', 'sva-1'], []);
		const invalidate = vi.spyOn(client, 'invalidateQueries');
		const { result, unmount } = renderHook(() => useDeleteServiceAccountMutation('org-1'), {
			wrapper: withClient(client),
		});
		act(() => result.current.mutate({ id: 'sva-1' }));
		unmount();
		response.resolve({ data: { id: 'sva-1', deleted: true } });
		await waitFor(() =>
			expect(invalidate).toHaveBeenCalledWith({ queryKey: ['org-1', 'serviceAccounts'], exact: true })
		);
		expect(client.getQueryData(['org-1', 'serviceAccounts', 'sva-1'])).toEqual({ id: 'sva-1' });
		expect(client.getQueryData(['org-1', 'apiTokens', 'sva-1'])).toEqual([]);
	});

	it('revoke refreshes the tokens and the accounts’ live counts', async () => {
		const response = deferred<{ data: object }>();
		del.mockReturnValue(response.promise);
		const client = new QueryClient();
		const invalidate = vi.spyOn(client, 'invalidateQueries');
		const { result, unmount } = renderHook(() => useRevokeOrganizationApiTokenMutation('org-1'), {
			wrapper: withClient(client),
		});
		act(() => result.current.mutate({ tokenId: 'oat-1' }));
		unmount();
		response.resolve({ data: { id: 'oat-1' } });
		await waitFor(() =>
			expect(invalidate).toHaveBeenCalledWith({ queryKey: ['org-1', 'apiTokens'], refetchType: 'active' })
		);
		expect(invalidate).toHaveBeenCalledWith({ queryKey: ['org-1', 'serviceAccounts'], refetchType: 'active' });
	});
});
