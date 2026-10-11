/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';

const mocks = vi.hoisted(() => {
	const post = vi.fn();
	return {
		post,
		sse: { enabled: false },
		instanceParams: { entityId: 'ins-1', entityType: 'instance', instanceClient: { post } },
		editorView: {
			reloadRootEntries: vi.fn(),
			setFocusedItem: vi.fn(),
			setExpandedItems: vi.fn(),
			setSelectedItems: vi.fn(),
		},
		runHealthCheck: vi.fn(),
	};
});

vi.mock('sonner', () => ({
	toast: { loading: vi.fn(() => 'loading-toast'), dismiss: vi.fn(), error: vi.fn(), success: vi.fn() },
}));
vi.mock('@/config/useInstanceClient', () => ({ useInstanceClientIdParams: () => mocks.instanceParams }));
vi.mock('@/features/instance/applications/hooks/useSupportsDeploymentSSE', () => ({
	useSupportsDeploymentSSE: () => mocks.sse.enabled,
}));
vi.mock('@/features/instance/applications/hooks/useComponentHealthCheck', () => ({
	useComponentHealthCheck: () => mocks.runHealthCheck,
}));
vi.mock('@/features/instance/applications/hooks/useEditorView', () => ({ useEditorView: () => mocks.editorView }));
vi.mock('@/integrations/api/instance/applications/deployComponentStream', () => ({ deployComponentStream: vi.fn() }));

import { deployComponentStream } from '@/integrations/api/instance/applications/deployComponentStream';
import { SSEInconclusiveError } from '@/integrations/api/sse/errors';
import { mutationErrorHandler } from '@/react-query/queryClient';
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { AxiosError, AxiosHeaders, InternalAxiosRequestConfig } from 'axios';
import { createElement, ReactNode } from 'react';
import { toast } from 'sonner';
import { defaultImportOptions } from './schema';
import { useImportApplication } from './useImportApplication';

const contents = { ...defaultImportOptions, source: 'npm' as const, ref: 'my-app@1.0.0' };

function serverFailure(data: unknown) {
	const config = { headers: new AxiosHeaders() } as InternalAxiosRequestConfig;
	return new AxiosError('Request failed with status code 500', AxiosError.ERR_BAD_RESPONSE, config, undefined, {
		data,
		status: 500,
		statusText: 'Internal Server Error',
		headers: {},
		config,
	});
}

function deferred() {
	let reject!: (error: unknown) => void;
	const promise = new Promise<never>((_, fail) => {
		reject = fail;
	});
	return { promise, reject };
}

function renderImport() {
	// The app's own routing, so the deploy mutation's opt-out from the global toast is what's tested.
	const queryClient = new QueryClient({ mutationCache: new MutationCache({ onError: mutationErrorHandler }) });
	return renderHook(() => useImportApplication(vi.fn()), {
		wrapper: ({ children }: { children: ReactNode }) =>
			createElement(QueryClientProvider, { client: queryClient }, children),
	});
}

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
	mocks.sse.enabled = false;
});

afterEach(() => {
	consoleError.mockRestore();
	vi.clearAllMocks();
});

describe('useImportApplication', () => {
	it("keeps a failed import's reason for the form to show, and toasts nothing", async () => {
		const failure = serverFailure({ error: 'Component my-app could not be loaded' });
		mocks.post.mockRejectedValue(failure);
		const { result } = renderImport();

		act(() => result.current.importApplication({ contents, project: 'my-app' }));

		await waitFor(() =>
			expect(result.current.importFailure).toEqual({
				project: 'my-app',
				message: 'Component my-app could not be loaded',
			})
		);
		expect(vi.mocked(toast.error)).not.toHaveBeenCalled();
		expect(vi.mocked(toast.dismiss)).toHaveBeenCalledWith('loading-toast');
		expect(consoleError).toHaveBeenCalledOnce();
		expect(consoleError).toHaveBeenCalledWith(failure);
	});

	it('clears the failure when the import is retried', async () => {
		mocks.post.mockRejectedValueOnce(serverFailure({ error: 'Component my-app could not be loaded' }));
		const { result } = renderImport();
		act(() => result.current.importApplication({ contents, project: 'my-app' }));
		await waitFor(() => expect(result.current.importFailure).toBeDefined());

		mocks.post.mockReturnValueOnce(deferred().promise);
		act(() => result.current.importApplication({ contents, project: 'my-app' }));

		expect(result.current.importFailure).toBeUndefined();
	});

	it('toasts a failure that arrives after the form has gone, the only place left to show it', async () => {
		const pending = deferred();
		mocks.post.mockReturnValue(pending.promise);
		const { result, unmount } = renderImport();
		act(() => result.current.importApplication({ contents, project: 'my-app' }));

		unmount();
		pending.reject(serverFailure({ error: 'Component my-app could not be loaded' }));

		await waitFor(() => expect(vi.mocked(toast.error)).toHaveBeenCalledOnce());
		expect(vi.mocked(toast.error)).toHaveBeenCalledWith('Failed to import my-app', {
			description: 'Component my-app could not be loaded',
		});
		expect(consoleError).toHaveBeenCalledOnce();
	});

	it('verifies an inconclusive stream instead of reporting it as a failure', async () => {
		mocks.sse.enabled = true;
		mocks.runHealthCheck.mockResolvedValue({ level: 'healthy' });
		vi.mocked(deployComponentStream).mockRejectedValue(new SSEInconclusiveError('stream ended'));
		onTestFinished(() => {
			vi.mocked(deployComponentStream).mockReset();
		});
		const { result } = renderImport();

		act(() => result.current.importApplication({ contents, project: 'my-app' }));

		await waitFor(() => expect(vi.mocked(toast.success)).toHaveBeenCalledWith('my-app deployed and healthy', {}));
		expect(result.current.importFailure).toBeUndefined();
		expect(vi.mocked(toast.error)).not.toHaveBeenCalled();
	});
});
