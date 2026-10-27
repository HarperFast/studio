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
		// One object per test, so the setting keeps its identity across renders as the real hook's does.
		branches: {
			available: false,
			current: {
				setting: undefined as string[] | true | undefined,
				known: false,
				loading: false,
				failed: false,
				retry: vi.fn(),
			},
		},
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
vi.mock('@/features/instance/applications/hooks/useBranchedDatabases', () => ({
	useBranchedDatabasesAvailable: () => mocks.branches.available,
	useApplicationBranchedDatabases: () => mocks.branches.current,
	invalidateApplicationConfiguration: vi.fn(),
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

import { invalidateApplicationConfiguration } from '@/features/instance/applications/hooks/useBranchedDatabases';
import {
	DeployComponentResult,
	deployComponentStream,
} from '@/integrations/api/instance/applications/deployComponentStream';
import { SSEOperationError } from '@/integrations/api/sse/errors';
import { UNANSWERED_WRITE_MESSAGE } from '@/integrations/api/unansweredWrite';
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

async function renderOpenModalWithRerender() {
	const queryClient = new QueryClient({ mutationCache: new MutationCache({ onError: mutationErrorHandler }) });
	const ui = () => (
		<QueryClientProvider client={queryClient}>
			<RedeployApplicationModal />
		</QueryClientProvider>
	);
	const rendered = render(ui());
	unmount = rendered.unmount;
	await act(async () => setWatchedValue('ShowRedeployApplicationModal', true));
	return { rerender: () => rendered.rerender(ui()) };
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
	mocks.branches.available = false;
	mocks.branches.current = { setting: undefined, known: false, loading: false, failed: false, retry: vi.fn() };
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

	describe('a redeploy that got no verdict', () => {
		const unanswered = () =>
			new AxiosError(
				'timeout of 300000ms exceeded',
				AxiosError.ECONNABORTED,
				{
					headers: new AxiosHeaders(),
					method: 'post',
					data: JSON.stringify({ operation: 'deploy_component' }),
				} as InternalAxiosRequestConfig,
			);
		const COMPONENTS = { queryKey: ['ins-1', 'get_components'], refetchType: 'active' };
		let invalidate: ReturnType<typeof vi.spyOn>;
		beforeEach(() => {
			invalidate = vi.spyOn(QueryClient.prototype, 'invalidateQueries');
		});

		it("replaces a buffered redeploy's progress toast without calling it failed, and refreshes the list", async () => {
			mocks.sse.enabled = false;
			mocks.post.mockRejectedValue(unanswered());
			await renderOpenModal();

			await submit();

			await waitFor(() => expect(vi.mocked(toast.error)).toHaveBeenCalledOnce());
			expect(vi.mocked(toast.error)).toHaveBeenCalledWith("Couldn't confirm my-app was redeployed", {
				id: 'loading-toast',
				description: UNANSWERED_WRITE_MESSAGE,
			});
			expect(invalidate).toHaveBeenCalledWith(COMPONENTS);
		});

		it('says so in the open progress panel, and refreshes the list', async () => {
			vi.mocked(deployComponentStream).mockRejectedValue(unanswered());
			await renderOpenModal();

			await submit();

			expect((await screen.findByRole('alert')).textContent).toContain(UNANSWERED_WRITE_MESSAGE);
			expect(vi.mocked(toast.error)).not.toHaveBeenCalled();
			expect(invalidate).toHaveBeenCalledWith(COMPONENTS);
		});

		it('refreshes nothing after a redeploy Harper refused', async () => {
			vi.mocked(deployComponentStream).mockRejectedValue(new SSEOperationError(FAILURE, { phase: 'load' }));
			await renderOpenModal();

			await submit();

			expect((await screen.findByRole('alert')).textContent).toContain(FAILURE);
			expect(invalidate).not.toHaveBeenCalledWith(COMPONENTS);
		});

		it('toasts a streamed one that lands after the modal was closed without calling it failed', async () => {
			const pending = deferred();
			vi.mocked(deployComponentStream).mockReturnValue(pending.promise);
			await renderOpenModal();
			await submit();

			await act(async () => {
				fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
			});
			await act(async () => pending.reject(unanswered()));

			await waitFor(() => expect(vi.mocked(toast.error)).toHaveBeenCalledOnce());
			expect(vi.mocked(toast.error)).toHaveBeenCalledWith("Couldn't confirm my-app was redeployed", {
				description: UNANSWERED_WRITE_MESSAGE,
			});
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

	it('reopens on the package a live redeploy just installed', async () => {
		vi.mocked(deployComponentStream).mockResolvedValue({ message: 'Successfully deployed' });
		let healthy!: () => void;
		mocks.runHealthCheck.mockReturnValue(
			new Promise((resolve) => {
				healthy = () => resolve({ level: 'healthy' });
			}),
		);
		const opened = mocks.editorView.openedEntry;
		try {
			const { rerender } = await renderOpenModalWithRerender();
			await act(async () => {
				fireEvent.change(screen.getByLabelText('Package Reference'), { target: { value: 'npm:my-app@2' } });
			});
			await submit();
			await waitFor(() => expect(mocks.runHealthCheck).toHaveBeenCalled());

			mocks.editorView.openedEntry = { ...opened, package: 'npm:my-app@2' };
			await act(async () => rerender());
			await act(async () => healthy());
			await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

			await act(async () => setWatchedValue('ShowRedeployApplicationModal', true));
			expect((screen.getByLabelText('Package Reference') as HTMLInputElement).value).toBe('npm:my-app@2');
		} finally {
			mocks.editorView.openedEntry = opened;
		}
	});

	describe('private database copy', () => {
		function sentBody() {
			return vi.mocked(deployComponentStream).mock.calls[0]?.[0].body;
		}

		beforeEach(() => {
			vi.mocked(deployComponentStream).mockResolvedValue({ message: 'Successfully deployed' });
		});

		it('resends the current setting when the form does not offer it, since a redeploy replaces the entry', async () => {
			mocks.branches.current = { setting: ['data'], known: true, loading: false, failed: false, retry: vi.fn() };
			await renderOpenModal();

			expect(screen.queryByText('Private database copy')).toBeNull();
			await submit();

			await waitFor(() => expect(sentBody()).toMatchObject({ branchedDatabases: ['data'] }));
		});

		it('starts the offered setting from the current one, so an unchanged redeploy keeps it', async () => {
			mocks.branches.available = true;
			mocks.branches.current = { setting: true, known: true, loading: false, failed: false, retry: vi.fn() };
			await renderOpenModal();

			expect(screen.getByRole('radio', { name: /All databases/ }).getAttribute('aria-checked')).toBe('true');
			await submit();

			await waitFor(() => expect(sentBody()).toMatchObject({ branchedDatabases: true }));
		});

		it('leaves the setting out when it is turned off, which puts the application back on the shared data', async () => {
			mocks.branches.available = true;
			mocks.branches.current = { setting: true, known: true, loading: false, failed: false, retry: vi.fn() };
			await renderOpenModal();

			await act(async () => {
				fireEvent.click(screen.getByRole('radio', { name: /Off/ }));
			});
			await submit();

			await waitFor(() => expect(sentBody()).toBeDefined());
			expect(sentBody()?.branchedDatabases).toBeUndefined();
		});

		it('refuses chosen databases with none picked, and sends the ones picked', async () => {
			mocks.branches.available = true;
			mocks.post.mockResolvedValue({ data: { data: {}, system: {} } });
			await renderOpenModal();

			await act(async () => {
				fireEvent.click(screen.getByRole('radio', { name: /Chosen databases/ }));
			});
			const data = await screen.findByRole('checkbox', { name: 'data' });
			expect(screen.queryByRole('checkbox', { name: 'system' })).toBeNull();
			await submit();

			expect(await screen.findByText('Choose at least one database.')).toBeTruthy();
			expect(deployComponentStream).not.toHaveBeenCalled();

			await act(async () => {
				fireEvent.click(data);
			});
			await submit();

			await waitFor(() => expect(sentBody()).toMatchObject({ branchedDatabases: ['data'] }));
		});

		it("refuses to redeploy while a super user's read of the setting has failed, even with the field hidden", async () => {
			mocks.branches.current = { setting: undefined, known: false, loading: false, failed: true, retry: vi.fn() };
			await renderOpenModal();

			expect(screen.getByRole('alert').textContent).toContain('a redeploy without that would turn one off');
			expect(screen.getByRole('button', { name: /Redeploy Application/ }).hasAttribute('disabled')).toBe(true);
			fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
			expect(mocks.branches.current.retry).toHaveBeenCalledOnce();
		});

		it('keeps what was typed when the current setting arrives after the form opened', async () => {
			mocks.branches.available = true;
			mocks.branches.current = { setting: undefined, known: false, loading: true, failed: false, retry: vi.fn() };
			const { rerender } = await renderOpenModalWithRerender();
			const install = screen.getByPlaceholderText(/Leave blank to install dependencies/);
			await act(async () => {
				fireEvent.change(install, { target: { value: 'npm ci' } });
			});

			mocks.branches.current = { setting: true, known: true, loading: false, failed: false, retry: vi.fn() };
			await act(async () => rerender());

			expect(screen.getByRole('radio', { name: /All databases/ }).getAttribute('aria-checked')).toBe('true');
			// The form state, not the input: an input whose value went undefined keeps showing what was typed.
			await submit();
			await waitFor(() => expect(sentBody()).toMatchObject({ install_command: 'npm ci', branchedDatabases: true }));
		});

		it('starts from a setting that arrived before the modal was first opened', async () => {
			mocks.branches.available = true;
			mocks.branches.current = { setting: undefined, known: false, loading: true, failed: false, retry: vi.fn() };
			const queryClient = new QueryClient();
			const ui = () => (
				<QueryClientProvider client={queryClient}>
					<RedeployApplicationModal />
				</QueryClientProvider>
			);
			const rendered = render(ui());
			unmount = rendered.unmount;

			mocks.branches.current = { setting: true, known: true, loading: false, failed: false, retry: vi.fn() };
			rendered.rerender(ui());
			await act(async () => setWatchedValue('ShowRedeployApplicationModal', true));

			expect(screen.getByRole('radio', { name: /All databases/ }).getAttribute('aria-checked')).toBe('true');
			await submit();
			await waitFor(() => expect(sentBody()).toMatchObject({ branchedDatabases: true }));
		});

		it('keeps an option picked before the current setting arrived', async () => {
			mocks.branches.available = true;
			mocks.branches.current = { setting: undefined, known: false, loading: true, failed: false, retry: vi.fn() };
			const { rerender } = await renderOpenModalWithRerender();
			await act(async () => {
				fireEvent.click(screen.getByRole('radio', { name: /All databases/ }));
			});

			mocks.branches.current = { setting: undefined, known: true, loading: false, failed: false, retry: vi.fn() };
			await act(async () => rerender());
			mocks.branches.current = { setting: ['data'], known: true, loading: false, failed: false, retry: vi.fn() };
			await act(async () => rerender());

			expect(screen.getByRole('radio', { name: /All databases/ }).getAttribute('aria-checked')).toBe('true');
		});

		it("says the database list couldn't be read, even beside a database already chosen", async () => {
			mocks.branches.available = true;
			mocks.branches.current = { setting: ['data'], known: true, loading: false, failed: false, retry: vi.fn() };
			mocks.post.mockRejectedValue(new Error('network down'));
			await renderOpenModal();

			expect(await screen.findByText("Studio couldn't list the databases.")).toBeTruthy();
			expect(screen.getByRole('checkbox', { name: 'data' })).toBeTruthy();
		});

		it('reopens on the setting a live redeploy just made, not the one from before it', async () => {
			mocks.branches.available = true;
			mocks.branches.current = { setting: true, known: true, loading: false, failed: false, retry: vi.fn() };
			let healthy!: () => void;
			mocks.runHealthCheck.mockReturnValue(
				new Promise((resolve) => {
					healthy = () => resolve({ level: 'healthy' });
				}),
			);
			const { rerender } = await renderOpenModalWithRerender();
			await act(async () => {
				fireEvent.click(screen.getByRole('radio', { name: /Off/ }));
			});
			await submit();
			await waitFor(() => expect(mocks.runHealthCheck).toHaveBeenCalled());

			// The redeploy's own refetch lands while the health check is still running.
			mocks.branches.current = { setting: undefined, known: true, loading: false, failed: false, retry: vi.fn() };
			await act(async () => rerender());
			await act(async () => healthy());
			await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

			await act(async () => setWatchedValue('ShowRedeployApplicationModal', true));
			expect(screen.getByRole('radio', { name: /Off/ }).getAttribute('aria-checked')).toBe('true');
			await submit();
			await waitFor(() => expect(deployComponentStream).toHaveBeenCalledTimes(2));
			expect(vi.mocked(deployComponentStream).mock.calls[1]?.[0].body.branchedDatabases).toBeUndefined();
		});

		it('drops an unsent pick when the package changes under the open form, and shows the current setting', async () => {
			mocks.branches.available = true;
			mocks.branches.current = { setting: true, known: true, loading: false, failed: false, retry: vi.fn() };
			const opened = mocks.editorView.openedEntry;
			try {
				const { rerender } = await renderOpenModalWithRerender();
				await act(async () => {
					fireEvent.click(screen.getByRole('radio', { name: /Off/ }));
				});

				mocks.editorView.openedEntry = { ...opened, package: 'npm:my-app@2' };
				await act(async () => rerender());

				expect(screen.getByRole('radio', { name: /All databases/ }).getAttribute('aria-checked')).toBe('true');
			} finally {
				mocks.editorView.openedEntry = opened;
			}
		});

		it('re-reads the setting each time it opens, since something outside this tab may have changed it', async () => {
			mocks.branches.current = { setting: true, known: true, loading: false, failed: false, retry: vi.fn() };
			await renderOpenModal();
			expect(invalidateApplicationConfiguration).toHaveBeenCalledOnce();

			await act(async () => setWatchedValue('ShowRedeployApplicationModal', false));
			await act(async () => setWatchedValue('ShowRedeployApplicationModal', true));

			expect(invalidateApplicationConfiguration).toHaveBeenCalledTimes(2);
			expect(invalidateApplicationConfiguration).toHaveBeenLastCalledWith(expect.any(QueryClient), 'ins-1');
		});

		it('says the list is still loading, even beside a database already chosen', async () => {
			mocks.branches.available = true;
			mocks.branches.current = { setting: ['data'], known: true, loading: false, failed: false, retry: vi.fn() };
			mocks.post.mockReturnValue(new Promise(() => {}));
			await renderOpenModal();

			expect(await screen.findByText('Loading databases…')).toBeTruthy();
			expect(screen.getByRole('checkbox', { name: 'data' })).toBeTruthy();
		});

		it('says so when there is nothing to choose besides system', async () => {
			mocks.branches.available = true;
			mocks.post.mockResolvedValue({ data: { system: {} } });
			await renderOpenModal();

			await act(async () => {
				fireEvent.click(screen.getByRole('radio', { name: /Chosen databases/ }));
			});

			expect(await screen.findByText('There are no databases to copy besides system.')).toBeTruthy();
		});

		it('waits for the current setting before it can be sent', async () => {
			mocks.branches.available = true;
			mocks.branches.current = { setting: undefined, known: false, loading: true, failed: false, retry: vi.fn() };
			await renderOpenModal();

			expect(screen.getByRole('button', { name: /Redeploy Application/ }).hasAttribute('disabled')).toBe(true);
		});
	});
});
