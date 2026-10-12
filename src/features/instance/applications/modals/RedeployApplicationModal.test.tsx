/**
 * @vitest-environment jsdom
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
	const post = vi.fn();
	return {
		post,
		sse: { enabled: true },
		instanceParams: { entityId: 'ins-1', entityType: 'instance', instanceClient: { post } },
		editorView: { openedEntry: { name: 'my-app', path: 'my-app', project: 'my-app', package: 'npm:my-app' } },
		runHealthCheck: vi.fn(),
		routeParams: { organizationId: 'org-1', instanceId: 'ins-1' },
		navigate: vi.fn(),
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
vi.mock('@tanstack/react-router', () => ({
	Link: ({ children }: { children?: ReactNode }) => <a>{children}</a>,
	useParams: () => mocks.routeParams,
	useNavigate: () => mocks.navigate,
}));
vi.mock('@/config/useInstanceClient', () => ({ useInstanceClientIdParams: () => mocks.instanceParams }));
vi.mock('@/features/instance/applications/hooks/useSupportsDeploymentSSE', () => ({
	useSupportsDeploymentSSE: () => mocks.sse.enabled,
	useStagedDeploymentsAvailable: () => false,
}));
vi.mock('@/features/instance/applications/hooks/useComponentHealthCheck', () => ({
	useComponentHealthCheck: () => mocks.runHealthCheck,
}));
vi.mock('@/features/instance/applications/hooks/useEditorView', () => ({ useEditorView: () => mocks.editorView }));
vi.mock('@/integrations/api/instance/applications/deployComponentStream', async (importOriginal) => ({
	...(await importOriginal<typeof import('@/integrations/api/instance/applications/deployComponentStream')>()),
	deployComponentStream: vi.fn(),
}));
vi.mock('@/lib/attemptToRestoreFocus', () => ({ attemptToRestoreFocus: vi.fn() }));

import {
	DeployComponentResult,
	deployComponentStream,
} from '@/integrations/api/instance/applications/deployComponentStream';
import { SSEOperationError } from '@/integrations/api/sse/errors';
import { setWatchedValue } from '@/lib/events/watcher';
import { mutationErrorHandler } from '@/react-query/queryClient';
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError, AxiosHeaders, InternalAxiosRequestConfig } from 'axios';
import { ReactNode } from 'react';
import { toast } from 'sonner';
import { RedeployApplicationModal } from './RedeployApplicationModal';

const FAILURE = 'npm install failed with exit code 1';

function deferred() {
	let reject!: (error: unknown) => void;
	const promise = new Promise<never>((_, fail) => {
		reject = fail;
	});
	return { promise, reject };
}

let unmount: () => void;

async function renderOpenModal() {
	// The app's own routing, so the deploy mutation's opt-out from the global toast is what's tested.
	const queryClient = new QueryClient({ mutationCache: new MutationCache({ onError: mutationErrorHandler }) });
	({ unmount } = render(
		<QueryClientProvider client={queryClient}>
			<RedeployApplicationModal />
		</QueryClientProvider>,
	));
	await act(async () => setWatchedValue('ShowRedeployApplicationModal', true));
}

async function submit() {
	await act(async () => {
		fireEvent.click(screen.getByRole('button', { name: /Redeploy Application/ }));
	});
}

beforeAll(() => {
	// Radix Dialog relies on DOM APIs jsdom doesn't implement.
	Element.prototype.hasPointerCapture ??= () => false;
	Element.prototype.setPointerCapture ??= () => undefined;
	Element.prototype.releasePointerCapture ??= () => undefined;
	Element.prototype.scrollIntoView ??= () => undefined;
});

beforeEach(() => {
	vi.spyOn(console, 'error').mockImplementation(() => undefined);
	mocks.sse.enabled = true;
});

afterEach(async () => {
	await act(async () => setWatchedValue('ShowRedeployApplicationModal', false));
	cleanup();
	vi.restoreAllMocks();
	vi.clearAllMocks();
});

describe('RedeployApplicationModal', () => {
	it('shows a streamed failure in the open progress panel only, not in a toast as well', async () => {
		vi.mocked(deployComponentStream).mockRejectedValue(new SSEOperationError(FAILURE, { phase: 'load' }));
		await renderOpenModal();

		await submit();

		expect((await screen.findByRole('alert')).textContent).toContain(FAILURE);
		expect(vi.mocked(toast.error)).not.toHaveBeenCalled();
	});

	it.each([
		[
			'the modal was closed',
			async () => {
				await act(async () => {
					fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
				});
				expect(screen.queryByRole('dialog')).toBeNull();
			},
		],
		['the page was left', async () => unmount()],
	])('toasts a streamed failure that lands after %s', async (_, leave) => {
		const pending = deferred();
		vi.mocked(deployComponentStream).mockReturnValue(pending.promise);
		await renderOpenModal();
		await submit();

		await leave();
		await act(async () => pending.reject(new SSEOperationError(FAILURE)));

		await waitFor(() => expect(vi.mocked(toast.error)).toHaveBeenCalledOnce());
		expect(vi.mocked(toast.error)).toHaveBeenCalledWith('Failed to redeploy my-app', { description: FAILURE });
	});

	it('leaves a reopened modal alone when the deploy it no longer shows succeeds', async () => {
		let succeed!: (value: DeployComponentResult) => void;
		vi.mocked(deployComponentStream).mockReturnValue(
			new Promise((resolve) => {
				succeed = resolve;
			}),
		);
		mocks.runHealthCheck.mockResolvedValue({ level: 'healthy' });
		await renderOpenModal();
		await submit();
		await act(async () => {
			fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
		});
		await act(async () => setWatchedValue('ShowRedeployApplicationModal', true));

		await act(async () => succeed({ message: 'Successfully deployed: my-app', deployment_id: 'd1' }));

		await waitFor(() =>
			expect(vi.mocked(toast.success)).toHaveBeenCalledWith('my-app deployed and healthy', expect.anything())
		);
		expect(screen.getByRole('dialog')).toBeTruthy();
		expect(screen.getByRole('button', { name: /Redeploy Application/ })).toBeTruthy();
	});

	it("replaces a buffered redeploy's progress toast with the server's reason, once", async () => {
		mocks.sse.enabled = false;
		const config = { headers: new AxiosHeaders() } as InternalAxiosRequestConfig;
		mocks.post.mockRejectedValue(
			new AxiosError('Request failed with status code 500', AxiosError.ERR_BAD_RESPONSE, config, undefined, {
				data: { error: FAILURE },
				status: 500,
				statusText: 'Internal Server Error',
				headers: {},
				config,
			}),
		);
		await renderOpenModal();

		await submit();

		await waitFor(() => expect(vi.mocked(toast.error)).toHaveBeenCalledOnce());
		expect(vi.mocked(toast.error)).toHaveBeenCalledWith('Failed to redeploy my-app', {
			id: 'loading-toast',
			description: FAILURE,
		});
	});

	describe('a rollout that settles after the modal was closed', () => {
		function deployThenFollow(job: () => Promise<unknown>) {
			vi.mocked(deployComponentStream).mockResolvedValue({ message: 'ok', deployment_id: 'd1', restartJobId: 'job-1' });
			mocks.post.mockImplementation(job);
		}

		async function closeModal() {
			await act(async () => {
				fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
			});
			expect(screen.queryByRole('dialog')).toBeNull();
		}

		it('still reports the outcome', async () => {
			let finish!: () => void;
			deployThenFollow(() =>
				new Promise((resolve) => {
					finish = () => resolve({ data: [{ id: 'job-1', status: 'COMPLETE', result: { replicated: [] } }] });
				})
			);
			mocks.runHealthCheck.mockResolvedValue({ level: 'healthy' });
			await renderOpenModal();
			await submit();
			await waitFor(() => expect(finish).toBeDefined());

			await closeModal();
			await act(async () => finish());

			await waitFor(() =>
				expect(vi.mocked(toast.success)).toHaveBeenCalledWith('my-app deployed and healthy', expect.anything())
			);
		});

		it('says which nodes did not take it in a toast, once', async () => {
			let fail!: () => void;
			deployThenFollow(() =>
				new Promise((resolve) => {
					fail = () => resolve({ data: [{ id: 'job-1', status: 'ERROR', message: 'node-c did not restart' }] });
				})
			);
			await renderOpenModal();
			await submit();
			await waitFor(() => expect(fail).toBeDefined());

			await closeModal();
			await act(async () => fail());

			await waitFor(() => expect(vi.mocked(toast.error)).toHaveBeenCalledOnce());
			expect(vi.mocked(toast.error)).toHaveBeenCalledWith('my-app did not reach every node', {
				description: 'node-c did not restart',
				action: { label: 'View record', onClick: expect.any(Function) },
			});
		});

		it('shows a failed rollout in the open panel only, while the modal is still open', async () => {
			deployThenFollow(() =>
				Promise.resolve({ data: [{ id: 'job-1', status: 'ERROR', message: 'node-c did not restart' }] })
			);
			await renderOpenModal();

			await submit();

			expect(await screen.findByText('node-c did not restart')).toBeTruthy();
			expect(vi.mocked(toast.error)).not.toHaveBeenCalled();
		});
	});
});
