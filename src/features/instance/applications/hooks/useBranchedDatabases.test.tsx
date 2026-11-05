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
		canRead: { value: true },
		instanceParams: { entityId: 'ins-1', entityType: 'instance', instanceClient: { post } },
	};
});

vi.mock('@/config/useInstanceClient', () => ({ useInstanceClientIdParams: () => mocks.instanceParams }));
vi.mock('@/hooks/usePermissions', () => ({
	useInstanceManagePermission: () => mocks.canManage.value,
	useInstanceConfigurationReadPermission: () => mocks.canRead.value,
}));

import { AxiosError, AxiosHeaders, InternalAxiosRequestConfig } from 'axios';
import {
	invalidateApplicationConfiguration,
	useApplicationBranchedDatabases,
	useApplicationEntryHasPackage,
	useBranchedDatabasesAvailable,
	useBranchedDatabasesPossible,
} from './useBranchedDatabases';

const CONFIGURATION = { http: { port: 9926 }, web: { package: 'npm:web', branchedDatabases: ['data'] } };

function renderWithQueries<T>(hook: () => T) {
	// `retryDelay: 0` because the hooks set their own `retry`, which this default can't turn off.
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 } } });
	const rendered = renderHook(hook, {
		wrapper: ({ children }: { children: ReactNode }) =>
			createElement(QueryClientProvider, { client: queryClient }, children),
	});
	return { ...rendered, queryClient };
}

function renderCurrent(project: string | undefined = 'web') {
	return renderWithQueries(() => useApplicationBranchedDatabases(project));
}

function forbidden() {
	const config = { headers: new AxiosHeaders() } as InternalAxiosRequestConfig;
	return new AxiosError('Request failed with status code 403', 'ERR_BAD_REQUEST', config, undefined, {
		status: 403,
		statusText: 'Forbidden',
		headers: {},
		config,
		data: { error: 'not authorized' },
	});
}

afterEach(() => {
	mocks.canManage.value = true;
	mocks.canRead.value = true;
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

	it("drops a first read sent before a write, so its answer can't count as current", async () => {
		let answerBeforeWrite!: (value: unknown) => void;
		mocks.post.mockReturnValueOnce(
			new Promise((resolve) => {
				answerBeforeWrite = resolve;
			}),
		);
		mocks.post.mockResolvedValueOnce({ data: { web: { package: 'npm:web' } } });
		const { result, queryClient } = renderCurrent();
		await waitFor(() => expect(mocks.post).toHaveBeenCalledOnce());

		await act(async () => {
			void invalidateApplicationConfiguration(queryClient, 'ins-1');
		});
		await act(async () => answerBeforeWrite({ data: CONFIGURATION }));

		await waitFor(() => expect(result.current.known).toBe(true));
		expect(result.current.setting).toBeUndefined();
		expect(mocks.post).toHaveBeenCalledTimes(2);
	});

	it('reports a refetch that fails after a write, rather than serving the answer from before it', async () => {
		mocks.post.mockResolvedValueOnce({ data: CONFIGURATION });
		const { result, queryClient } = renderCurrent();
		await waitFor(() => expect(result.current.known).toBe(true));

		mocks.post.mockRejectedValue(new Error('network down'));
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
		mocks.canRead.value = false;
		const { result } = renderCurrent();

		expect(mocks.post).not.toHaveBeenCalled();
		expect(result.current).toMatchObject({ readable: false, known: false, loading: false, failed: false });
	});
});

describe('a role that is not a super user', () => {
	it('reads the setting when its allowlist grants get_configuration, so a redeploy can resend it', async () => {
		mocks.canManage.value = false;
		mocks.post.mockResolvedValue({ data: CONFIGURATION });
		const { result } = renderCurrent();

		await waitFor(() => expect(result.current.known).toBe(true));
		expect(result.current).toMatchObject({ readable: true, setting: ['data'] });
	});

	it("reads Harper's refusal as unreadable rather than failed, so nothing waits on a retry that can't succeed", async () => {
		mocks.canManage.value = false;
		mocks.post.mockRejectedValue(forbidden());
		const { result } = renderCurrent();

		await waitFor(() => expect(result.current.readable).toBe(false));
		expect(result.current).toMatchObject({ known: false, loading: false, failed: false, setting: undefined });
		expect(mocks.post).toHaveBeenCalledOnce();
	});

	it('asks no more once Harper has refused, so reopening a dialog neither asks again nor reads as loading', async () => {
		mocks.canManage.value = false;
		mocks.post.mockRejectedValue(forbidden());
		const { result, queryClient } = renderCurrent();
		await waitFor(() => expect(result.current.readable).toBe(false));

		await act(() => invalidateApplicationConfiguration(queryClient, 'ins-1'));

		expect(result.current).toMatchObject({ readable: false, loading: false, failed: false });
		expect(mocks.post).toHaveBeenCalledOnce();
	});
});

describe('useBranchedDatabasesPossible', () => {
	it.each([
		['5.2.4', false],
		['5.3.2', true],
		['5.4.0-beta.2', true],
	])('on %s → %s', async (version, expected) => {
		mocks.post.mockResolvedValue({ data: { version } });
		const { result } = renderWithQueries(() => useBranchedDatabasesPossible());

		await waitFor(() => expect(mocks.post).toHaveBeenCalled());
		await waitFor(() => expect(result.current).toBe(expected));
	});

	it("counts an unreadable version as possible, since the roles that can't read the setting often can't read it either", async () => {
		mocks.post.mockRejectedValue(forbidden());
		const { result } = renderWithQueries(() => useBranchedDatabasesPossible());

		await waitFor(() => expect(result.current).toBe(true));
	});

	it('counts a version still on its way as possible, so a redeploy sent meanwhile is warned about', () => {
		mocks.post.mockReturnValue(new Promise(() => {}));
		const { result } = renderWithQueries(() => useBranchedDatabasesPossible());

		expect(result.current).toBe(true);
	});
});

describe('useApplicationEntryHasPackage', () => {
	it("reads whether the application's entry names a package", async () => {
		mocks.post.mockResolvedValue({ data: { web: { package: 'npm:web' }, app: { branchedDatabases: ['data'] } } });
		const { result } = renderWithQueries(() => [
			useApplicationEntryHasPackage('web'),
			useApplicationEntryHasPackage('app'),
		]);

		await waitFor(() => expect(result.current[0]).toBe(true));
		expect(result.current[1]).toBe(false);
	});
});

describe('useBranchedDatabasesAvailable', () => {
	it('survives the permission resolving after the first render', async () => {
		mocks.canManage.value = false;
		mocks.post.mockResolvedValue({ data: { version: '5.4.0-beta.2' } });
		const { result, rerender } = renderWithQueries(() => useBranchedDatabasesAvailable());
		expect(result.current).toBe(false);

		mocks.canManage.value = true;
		rerender();

		await waitFor(() => expect(result.current).toBe(true));
	});
});
