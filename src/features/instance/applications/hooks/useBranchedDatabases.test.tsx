/**
 * @vitest-environment jsdom
 */
import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
	const post = vi.fn();
	return {
		post,
		canManage: { value: true },
		instanceParams: { entityId: 'ins-1', entityType: 'instance', instanceClient: { post } },
	};
});

vi.mock('@/config/useInstanceClient', () => ({ useInstanceClientIdParams: () => mocks.instanceParams }));
vi.mock('@/hooks/usePermissions', () => ({ useInstanceManagePermission: () => mocks.canManage.value }));

import { invalidateApplicationConfiguration, useApplicationBranchedDatabases } from './useBranchedDatabases';

const CONFIGURATION = { http: { port: 9926 }, web: { package: 'npm:web', branchedDatabases: ['data'] } };

function renderCurrent(project: string | undefined = 'web') {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	const rendered = renderHook(() => useApplicationBranchedDatabases(project), {
		wrapper: ({ children }: { children: ReactNode }) =>
			createElement(QueryClientProvider, { client: queryClient }, children),
	});
	return { ...rendered, queryClient };
}

afterEach(() => {
	mocks.canManage.value = true;
	vi.clearAllMocks();
});

describe('useApplicationBranchedDatabases', () => {
	it("reads the application's entry, and keeps the setting's identity across renders", async () => {
		mocks.post.mockResolvedValue({ data: CONFIGURATION });
		const { result, rerender } = renderCurrent();

		await waitFor(() => expect(result.current.known).toBe(true));
		const setting = result.current.setting;
		expect(setting).toEqual(['data']);
		rerender();
		expect(result.current.setting).toBe(setting);
	});

	it("stops trusting the last answer once Studio's own write invalidates it, until a read succeeds", async () => {
		mocks.post.mockResolvedValueOnce({ data: CONFIGURATION });
		const { result, queryClient } = renderCurrent();
		await waitFor(() => expect(result.current.known).toBe(true));

		mocks.post.mockReturnValueOnce(new Promise(() => {}));
		await act(async () => {
			void invalidateApplicationConfiguration(queryClient, 'ins-1');
		});

		await waitFor(() => expect(result.current).toMatchObject({ known: false, loading: true, failed: false }));
		expect(result.current.setting).toEqual(['data']);
	});

	it('counts a read still in flight as loading, since it may be about to change the answer', async () => {
		mocks.post.mockResolvedValueOnce({ data: CONFIGURATION });
		const { result } = renderCurrent();
		await waitFor(() => expect(result.current.known).toBe(true));

		mocks.post.mockReturnValueOnce(new Promise(() => {}));
		await act(async () => result.current.retry());

		await waitFor(() => expect(result.current).toMatchObject({ known: true, loading: true, failed: false }));
	});

	it('reports a refetch that fails after a write, rather than serving the answer from before it', async () => {
		mocks.post.mockResolvedValueOnce({ data: CONFIGURATION });
		const { result, queryClient } = renderCurrent();
		await waitFor(() => expect(result.current.known).toBe(true));

		mocks.post.mockRejectedValueOnce(new Error('network down'));
		await act(() => invalidateApplicationConfiguration(queryClient, 'ins-1'));

		await waitFor(() => expect(result.current).toMatchObject({ known: false, loading: false, failed: true }));
	});

	it('counts a read paused while offline as still loading', async () => {
		onlineManager.setOnline(false);
		try {
			const { result } = renderCurrent();

			await waitFor(() => expect(result.current).toMatchObject({ known: false, loading: true, failed: false }));
			expect(mocks.post).not.toHaveBeenCalled();
		} finally {
			onlineManager.setOnline(true);
		}
	});

	it('reports a first read that fails, so the redeploy can wait instead of turning the copy off', async () => {
		mocks.post.mockRejectedValue(new Error('network down'));
		const { result } = renderCurrent();

		await waitFor(() => expect(result.current.failed).toBe(true));
		expect(result.current).toMatchObject({ setting: undefined, known: false, loading: false });
	});

	it('asks nothing for someone who cannot read get_configuration', () => {
		mocks.canManage.value = false;
		const { result } = renderCurrent();

		expect(mocks.post).not.toHaveBeenCalled();
		expect(result.current).toMatchObject({ known: false, loading: false, failed: false });
	});
});
