/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';

const mocks = vi.hoisted(() => {
	const post = vi.fn();
	return {
		post,
		sse: { enabled: false },
		instanceParams: { entityId: 'ins-1', entityType: 'instance', instanceClient: { post } } as {
			entityId: string;
			entityType: string;
			instanceClient: { post: typeof post };
		},
		editorView: {
			reloadRootEntries: vi.fn(),
			setFocusedItem: vi.fn(),
			setExpandedItems: vi.fn(),
			setSelectedItems: vi.fn(),
		},
		runHealthCheck: vi.fn(),
		canStage: { enabled: false },
		canBranch: { enabled: false },
		invalidateConfiguration: vi.fn(),
		recordAction: vi.fn((deploymentId: string | undefined) =>
			deploymentId ? { label: 'View record', onClick: () => undefined } : undefined
		),
	};
});

vi.mock('sonner', () => ({
	toast: {
		loading: vi.fn(() => 'loading-toast'),
		dismiss: vi.fn(),
		error: vi.fn(),
		success: vi.fn(),
		warning: vi.fn(),
	},
}));
vi.mock('@/config/useInstanceClient', () => ({ useInstanceClientIdParams: () => mocks.instanceParams }));
vi.mock('@/features/instance/applications/hooks/useSupportsDeploymentSSE', () => ({
	useSupportsDeploymentSSE: () => mocks.sse.enabled,
	useStagedDeploymentsAvailable: () => mocks.canStage.enabled,
}));
vi.mock('@/features/instance/applications/hooks/useBranchedDatabases', () => ({
	useBranchedDatabasesAvailable: () => mocks.canBranch.enabled,
	invalidateApplicationConfiguration: mocks.invalidateConfiguration,
}));
vi.mock('@/features/instance/applications/hooks/useDeploymentRecordAction', () => ({
	useDeploymentRecordAction: () => mocks.recordAction,
}));
vi.mock('@/features/instance/applications/hooks/useComponentHealthCheck', () => ({
	useComponentHealthCheck: () => mocks.runHealthCheck,
}));
vi.mock('@/features/instance/applications/hooks/useEditorView', () => ({ useEditorView: () => mocks.editorView }));
vi.mock('@/integrations/api/instance/applications/deployComponentStream', () => ({ deployComponentStream: vi.fn() }));

import { deployComponentStream } from '@/integrations/api/instance/applications/deployComponentStream';
import { SSEInconclusiveError } from '@/integrations/api/sse/errors';
import { UNANSWERED_WRITE_MESSAGE } from '@/integrations/api/unansweredWrite';
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
	mocks.canStage.enabled = false;
	mocks.canBranch.enabled = false;
	mocks.instanceParams = { ...mocks.instanceParams, entityId: 'ins-1' };
});

afterEach(() => {
	consoleError?.mockRestore();
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
				title: 'Failed to import my-app',
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

	it("reports an import that finishes after the form has gone, without moving the editor's selection", async () => {
		let succeed!: (value: unknown) => void;
		mocks.post.mockReturnValue(
			new Promise((resolve) => {
				succeed = resolve;
			}),
		);
		const { result, unmount } = renderImport();
		act(() => result.current.importApplication({ contents, project: 'my-app' }));

		unmount();
		succeed({ data: { message: 'Successfully deployed: my-app' } });

		await waitFor(() => expect(vi.mocked(toast.success)).toHaveBeenCalledOnce());
		expect(vi.mocked(toast.dismiss)).toHaveBeenCalledWith('loading-toast');
		expect(mocks.editorView.reloadRootEntries).toHaveBeenCalledOnce();
		expect(mocks.editorView.setSelectedItems).not.toHaveBeenCalled();
		expect(mocks.editorView.setFocusedItem).not.toHaveBeenCalled();
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

	it("keeps a failure off another instance's form, and toasts it with its own record", async () => {
		const pending = deferred();
		mocks.post.mockReturnValue(pending.promise);
		const { result, rerender } = renderImport();
		act(() => result.current.importApplication({ contents, project: 'my-app' }));

		mocks.instanceParams = { ...mocks.instanceParams, entityId: 'ins-2' };
		rerender();
		await act(async () =>
			pending.reject(serverFailure({ error: 'Component my-app could not be loaded', deployment_id: 'd1' }))
		);

		await waitFor(() => expect(vi.mocked(toast.error)).toHaveBeenCalledOnce());
		expect(vi.mocked(toast.error)).toHaveBeenCalledWith('Failed to import my-app', {
			description: 'Component my-app could not be loaded',
			action: { label: 'View record', onClick: expect.any(Function) },
		});
		expect(result.current.importFailure).toBeUndefined();
	});

	it("leaves another instance's editor selection alone when the import finishes there", async () => {
		let succeed!: (value: unknown) => void;
		mocks.post.mockReturnValue(
			new Promise((resolve) => {
				succeed = resolve;
			}),
		);
		const { result, rerender } = renderImport();
		act(() => result.current.importApplication({ contents, project: 'my-app' }));

		mocks.instanceParams = { ...mocks.instanceParams, entityId: 'ins-2' };
		rerender();
		await act(async () => succeed({ data: { message: 'Successfully deployed: my-app' } }));

		await waitFor(() => expect(vi.mocked(toast.success)).toHaveBeenCalledOnce());
		expect(mocks.editorView.setSelectedItems).not.toHaveBeenCalled();
	});

	it("shows an instance's failure on its own form only", async () => {
		mocks.post.mockRejectedValue(serverFailure({ error: 'Component my-app could not be loaded' }));
		const { result, rerender } = renderImport();
		act(() => result.current.importApplication({ contents, project: 'my-app' }));
		await waitFor(() => expect(result.current.importFailure).toBeDefined());

		const first = mocks.instanceParams;
		mocks.instanceParams = { ...first, entityId: 'ins-2' };
		rerender();
		expect(result.current.importFailure).toBeUndefined();

		mocks.instanceParams = first;
		rerender();
		expect(result.current.importFailure?.title).toBe('Failed to import my-app');
	});

	it('names a failed stage as a stage, and keeps the record it left', async () => {
		mocks.canStage.enabled = true;
		mocks.post.mockRejectedValue(serverFailure({ error: 'Not every node staged it', deployment_id: 'd1' }));
		const { result } = renderImport();

		act(() => result.current.importApplication({ contents: { ...contents, stageOnly: true }, project: 'my-app' }));

		await waitFor(() =>
			expect(result.current.importFailure).toEqual({
				title: 'Failed to stage my-app',
				message: 'Not every node staged it',
				deploymentId: 'd1',
			})
		);
		expect(mocks.post).toHaveBeenCalledWith('/', expect.objectContaining({ activate: false }), expect.anything());
	});

	it.each([
		[false, "Couldn't confirm my-app was imported"],
		[true, "Couldn't confirm my-app was staged"],
	])('never calls a deploy that got no verdict failed (stage: %s)', async (stageOnly, title) => {
		mocks.canStage.enabled = stageOnly;
		const config = {
			headers: new AxiosHeaders(),
			method: 'post',
			data: JSON.stringify({ operation: 'deploy_component' }),
		} as InternalAxiosRequestConfig;
		mocks.post.mockRejectedValue(new AxiosError('timeout of 300000ms exceeded', AxiosError.ECONNABORTED, config));
		const { result } = renderImport();

		act(() => result.current.importApplication({ contents: { ...contents, stageOnly }, project: 'my-app' }));

		await waitFor(() => expect(result.current.importFailure).toEqual({ title, message: UNANSWERED_WRITE_MESSAGE }));
		expect(vi.mocked(toast.error)).not.toHaveBeenCalled();
		// It may have imported, so the tree the message says to check is reloaded.
		expect(mocks.editorView.reloadRootEntries).toHaveBeenCalledOnce();
	});

	it('reloads nothing after an import Harper refused', async () => {
		mocks.post.mockRejectedValue(serverFailure({ error: 'Component my-app could not be loaded' }));
		const { result } = renderImport();

		act(() => result.current.importApplication({ contents, project: 'my-app' }));

		await waitFor(() => expect(result.current.importFailure).toBeDefined());
		expect(mocks.editorView.reloadRootEntries).not.toHaveBeenCalled();
	});

	describe('a rollout that settles after the form has gone', () => {
		function deployThenFollow(job: () => Promise<unknown>) {
			mocks.post.mockImplementation((_url: string, body: { operation: string }) =>
				body.operation === 'deploy_component'
					? Promise.resolve({ data: { message: 'ok', deployment_id: 'd1', restartJobId: 'job-1' } })
					: job()
			);
		}

		it('still replaces the progress toast with the outcome', async () => {
			let finish!: () => void;
			deployThenFollow(() =>
				new Promise((resolve) => {
					finish = () =>
						resolve({
							data: [{ id: 'job-1', status: 'COMPLETE', result: { replicated: [] } }],
						});
				})
			);
			mocks.runHealthCheck.mockResolvedValue({ level: 'healthy' });
			const { result, unmount } = renderImport();
			act(() => result.current.importApplication({ contents, project: 'my-app' }));
			await waitFor(() => expect(finish).toBeDefined());

			unmount();
			finish();

			await waitFor(() =>
				expect(vi.mocked(toast.success)).toHaveBeenCalledWith('my-app deployed and healthy', expect.anything())
			);
			expect(vi.mocked(toast.dismiss)).toHaveBeenCalledWith('loading-toast');
			expect(mocks.editorView.setSelectedItems).not.toHaveBeenCalled();
		});

		it('still says which nodes did not take it, once', async () => {
			let fail!: () => void;
			deployThenFollow(() =>
				new Promise((resolve) => {
					fail = () => resolve({ data: [{ id: 'job-1', status: 'ERROR', message: 'node-c did not restart' }] });
				})
			);
			const { result, unmount } = renderImport();
			act(() => result.current.importApplication({ contents, project: 'my-app' }));
			await waitFor(() => expect(fail).toBeDefined());

			unmount();
			fail();

			await waitFor(() => expect(vi.mocked(toast.error)).toHaveBeenCalledOnce());
			expect(vi.mocked(toast.error)).toHaveBeenCalledWith('my-app did not reach every node', {
				description: 'node-c did not restart',
				action: { label: 'View record', onClick: expect.any(Function) },
			});
			expect(vi.mocked(toast.dismiss)).toHaveBeenCalledWith('loading-toast');
			expect(consoleError).toHaveBeenCalledOnce();
		});
	});

	describe('private database copy', () => {
		const privateCopy = { mode: 'chosen' as const, databases: ['data'] };

		async function importWith(value: typeof privateCopy) {
			mocks.post.mockResolvedValue({ data: { message: 'Successfully deployed' } });
			const { result } = renderImport();
			act(() => result.current.importApplication({ contents: { ...contents, privateCopy: value }, project: 'my-app' }));
			await waitFor(() => expect(mocks.post).toHaveBeenCalled());
			return mocks.post.mock.calls[0][1];
		}

		it('sends the chosen databases when the form offers the setting', async () => {
			mocks.canBranch.enabled = true;
			expect(await importWith(privateCopy)).toMatchObject({ branchedDatabases: ['data'] });
		});

		it("sends nothing when it isn't offered, whatever the form holds", async () => {
			expect((await importWith(privateCopy)).branchedDatabases).toBeUndefined();
		});

		it('re-reads the setting once the import lands', async () => {
			mocks.canBranch.enabled = true;
			await importWith(privateCopy);

			await waitFor(() => expect(mocks.invalidateConfiguration).toHaveBeenCalledWith(expect.any(QueryClient), 'ins-1'));
		});
	});
});
