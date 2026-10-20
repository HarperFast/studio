/** @vitest-environment jsdom */
import { getOrganizationQueryOptions } from '@/features/organization/queries/getOrganizationQuery';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { createElement, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { get, del } = vi.hoisted(() => ({ get: vi.fn(), del: vi.fn() }));
vi.mock('@/config/apiClient', () => ({ apiClient: { get, delete: del } }));

import { useDeleteOrganizationMutation } from './deleteOrganization';

const DELETED = 'org-deleted';
const KEPT = 'org-kept';

function deferred() {
	let resolve!: (value: { data: unknown }) => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<{ data: unknown }>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

async function seededClient() {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	get.mockImplementation(async (url: string) => ({ data: { id: url.split('/').pop(), name: 'Org' } }));
	await client.fetchQuery(getOrganizationQueryOptions(DELETED));
	await client.fetchQuery(getOrganizationQueryOptions(KEPT));
	client.setQueryData([DELETED, 'roles'], []);
	get.mockClear();
	return client;
}

const withClient = (client: QueryClient) => ({ children }: { children: ReactNode }) =>
	createElement(QueryClientProvider, { client }, children);

describe('useDeleteOrganizationMutation', () => {
	beforeEach(() => {
		get.mockReset();
		del.mockReset();
	});

	it('forgets the deleted organization, so its route asks the server instead of serving the cached record', async () => {
		const client = await seededClient();
		del.mockResolvedValue({ data: { id: DELETED, deleted: true } });
		const { result } = renderHook(() => useDeleteOrganizationMutation(), { wrapper: withClient(client) });

		await act(() => result.current.mutateAsync(DELETED));

		expect(client.getQueryCache().findAll({ queryKey: [DELETED] })).toHaveLength(0);
		expect(client.getQueryData([KEPT])).toBeDefined();

		// What `orgLayoutRoute.beforeLoad` does on a back-navigation to the deleted org.
		get.mockRejectedValueOnce(Object.assign(new Error('Forbidden'), { response: { status: 403 } }));
		await expect(client.ensureQueryData(getOrganizationQueryOptions(DELETED))).rejects.toThrow('Forbidden');
		expect(get).toHaveBeenCalledWith(`/Organization/${DELETED}`);
	});

	it('still forgets it when the page unmounts while the delete is in flight', async () => {
		const client = await seededClient();
		const pending = deferred();
		del.mockReturnValue(pending.promise);
		const { result, unmount } = renderHook(() => useDeleteOrganizationMutation(), { wrapper: withClient(client) });

		act(() => result.current.mutate(DELETED));
		unmount();
		await act(async () => {
			pending.resolve({ data: { id: DELETED, deleted: true } });
			await pending.promise;
		});

		await vi.waitFor(() => expect(client.getQueryCache().findAll({ queryKey: [DELETED] })).toHaveLength(0));
	});

	it('leaves the cache alone when the server refuses the delete', async () => {
		const client = await seededClient();
		del.mockRejectedValue(Object.assign(new Error('Cannot delete organization with active clusters'), {
			response: { status: 403 },
		}));
		const { result } = renderHook(() => useDeleteOrganizationMutation(), { wrapper: withClient(client) });

		await act(() => expect(result.current.mutateAsync(DELETED)).rejects.toThrow());

		expect(client.getQueryData([DELETED])).toBeDefined();
		expect(client.getQueryData([DELETED, 'roles'])).toBeDefined();
	});
});
