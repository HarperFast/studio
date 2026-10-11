/** @vitest-environment jsdom */
import { OperationsIndex } from '@/features/instance/operations/index';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import axios, { AxiosError, CanceledError, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { state, invalidateEntityQueries, markRestarting, releaseRestart, restartSettles } = vi.hoisted(() => {
	const releaseRestart = vi.fn();
	const restartSettles = { resolve: () => {}, promise: Promise.resolve() } as {
		resolve: () => void;
		promise: Promise<void>;
	};
	return {
		state: {
			canManage: true,
			user: { username: 'HDB_ADMIN' } as { username: string } | null,
			entityId: 'ins-1',
		},
		invalidateEntityQueries: vi.fn(),
		releaseRestart,
		markRestarting: vi.fn(() => releaseRestart),
		restartSettles,
	};
});

vi.mock('@/lib/monaco/MonacoEditor', () => ({
	Editor: ({ value, onChange }: { value?: string; onChange?: (value: string | undefined) => void }) => (
		<textarea
			aria-label="Operation request"
			value={value ?? ''}
			onChange={(event) => onChange?.(event.target.value)}
		/>
	),
}));
vi.mock('@/hooks/useMonacoTheme', () => ({ useMonacoTheme: () => 'light' }));
vi.mock('@/hooks/usePermissions', () => ({ useInstanceManagePermission: () => state.canManage }));
vi.mock('@/hooks/useAuth', () => ({ useInstanceAuth: () => ({ user: state.user, isLoading: false }) }));
vi.mock('@/react-query/invalidateEntityQueries', () => ({ invalidateEntityQueries }));
vi.mock('@/lib/restart/restartTracker', async (importOriginal) => ({
	...(await importOriginal<typeof import('@/lib/restart/restartTracker')>()),
	markRestarting,
}));
vi.mock('@/integrations/api/instance/status/restartInstance', () => ({
	RESTART_MARK_TTL_MS: 600_000,
	waitUntilAnsweringAfterRestart: () => restartSettles.promise,
}));
vi.mock('@tanstack/react-router', () => ({
	Navigate: ({ to }: { to: string }) => <div data-testid="redirect">{to}</div>,
	useParams: () => ({ organizationId: 'org-1', clusterId: 'clu-1', instanceId: 'ins-1' }),
}));

const instanceClient = axios.create({ headers: { 'Content-Type': 'application/json' } });
vi.mock('@/config/useInstanceClient', () => ({
	useInstanceClientIdParams: () => ({ instanceClient, entityId: state.entityId, entityType: 'instance' }),
}));

let adapter: ReturnType<typeof vi.fn<(config: InternalAxiosRequestConfig) => Promise<unknown>>>;

function ok(config: InternalAxiosRequestConfig, data: string) {
	return { status: 200, statusText: 'OK', data, headers: { 'content-type': 'application/json' }, config };
}

function renderPage() {
	const queryClient = new QueryClient();
	const page = () => (
		<QueryClientProvider client={queryClient}>
			<OperationsIndex />
		</QueryClientProvider>
	);
	const result = render(page());
	return { ...result, rerenderPage: () => result.rerender(page()) };
}

function typeRequest(text: string) {
	fireEvent.change(screen.getByLabelText('Operation request'), { target: { value: text } });
}

function send() {
	fireEvent.click(screen.getByRole('button', { name: 'Send' }));
}

function sentBodies() {
	return adapter.mock.calls.map(([config]) => config.data);
}

beforeEach(() => {
	state.canManage = true;
	state.user = { username: 'HDB_ADMIN' };
	state.entityId = 'ins-1';
	markRestarting.mockClear();
	releaseRestart.mockClear();
	restartSettles.promise = new Promise<void>((resolve) => (restartSettles.resolve = resolve));
	adapter = vi.fn(async (config: InternalAxiosRequestConfig) => ok(config, '{"message":"done"}'));
	instanceClient.defaults.adapter = adapter as never;
	invalidateEntityQueries.mockClear();
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe('OperationsIndex', () => {
	it('sends a read straight away and shows the formatted answer', async () => {
		adapter.mockImplementation(async (config) => ok(config, '{"dev":{"dog":{}}}'));
		renderPage();

		send();

		expect(await screen.findByText('200 OK')).toBeTruthy();
		expect(screen.getByText(/"dev": \{/)).toBeTruthy();
		expect(sentBodies()).toEqual(['{\n\t"operation": "describe_all"\n}']);
		expect(screen.queryByRole('alertdialog')).toBeNull();
		expect(invalidateEntityQueries).not.toHaveBeenCalled();
	});

	it('refuses invalid JSON inline, naming where it broke, and sends nothing', () => {
		renderPage();
		typeRequest('{\n\t"operation": "describe_all",\n}');

		send();

		expect(screen.getByRole('alert').textContent).toMatch(/^Line 3, column 1: /);
		expect(adapter).not.toHaveBeenCalled();
	});

	it('refuses a body that names no operation, and clears the complaint once it is edited', () => {
		renderPage();
		typeRequest('{"database": "dev"}');
		send();

		expect(screen.getByRole('alert').textContent).toMatch(/needs an "operation"/);
		expect(adapter).not.toHaveBeenCalled();

		typeRequest('{"operation": "describe_all"}');

		expect(screen.queryByRole('alert')).toBeNull();
	});

	it('asks before sending anything that is not a read, and sends nothing when cancelled', () => {
		renderPage();
		typeRequest('{"operation": "drop_table", "database": "dev", "table": "dog"}');

		send();

		const dialog = screen.getByRole('alertdialog');
		expect(dialog.textContent).toContain('Run drop_table on this instance?');
		expect(dialog.textContent).toContain('"table": "dog"');

		fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

		expect(screen.queryByRole('alertdialog')).toBeNull();
		expect(adapter).not.toHaveBeenCalled();
	});

	it('sends the confirmed body exactly once and marks cached data stale without refetching it', async () => {
		renderPage();
		const body = '{"operation": "drop_table", "database": "dev", "table": "dog"}';
		typeRequest(body);
		send();

		fireEvent.click(screen.getByRole('button', { name: 'Run drop_table' }));

		expect(await screen.findByText('200 OK')).toBeTruthy();
		expect(sentBodies()).toEqual([body]);
		expect(invalidateEntityQueries).toHaveBeenCalledWith(expect.anything(), 'ins-1', { refetchType: 'none' });
	});

	it("renders Harper's error inline and never hands it to console.error", async () => {
		const consoleError = vi.spyOn(console, 'error');
		adapter.mockImplementation(async (config) => {
			const response = {
				status: 403,
				statusText: 'Forbidden',
				data: '{"error":"This operation is not authorized due to role restrictions"}',
				headers: { 'content-type': 'application/json' },
				config,
			};
			throw new AxiosError(
				'Request failed with status code 403',
				AxiosError.ERR_BAD_REQUEST,
				config,
				undefined,
				response,
			);
		});
		renderPage();

		send();

		expect(await screen.findByText('403 Forbidden')).toBeTruthy();
		expect(screen.getByText(/not authorized due to role restrictions/)).toBeTruthy();
		expect(consoleError).not.toHaveBeenCalled();
	});

	it('marks data stale after a write Harper answered with an error, which may have changed something first', async () => {
		adapter.mockImplementation(async (config) => {
			const response = { status: 400, statusText: 'Bad Request', data: '{"error":"partial"}', headers: {}, config };
			throw new AxiosError(
				'Request failed with status code 400',
				AxiosError.ERR_BAD_REQUEST,
				config,
				undefined,
				response,
			);
		});
		renderPage();
		typeRequest('{"operation": "my_component_import", "rows": 10}');
		send();

		fireEvent.click(screen.getByRole('button', { name: 'Run my_component_import' }));

		expect(await screen.findByText('400 Bad Request')).toBeTruthy();
		expect(invalidateEntityQueries).toHaveBeenCalledWith(expect.anything(), 'ins-1', { refetchType: 'none' });
	});

	it('says an unanswered write may have run', async () => {
		adapter.mockImplementation(async (config) => {
			throw new AxiosError('Network Error', AxiosError.ERR_NETWORK, config);
		});
		renderPage();
		typeRequest('{"operation": "restart"}');
		send();
		fireEvent.click(screen.getByRole('button', { name: 'Run restart' }));

		expect(await screen.findByText('No response from Harper.')).toBeTruthy();
		expect(screen.getByText('Network Error')).toBeTruthy();
		expect(screen.getByText(/may or may not have run/)).toBeTruthy();
		expect(invalidateEntityQueries).toHaveBeenCalledTimes(1);
	});

	it('sends once however fast Send is clicked', async () => {
		let answer: (value: unknown) => void = () => {};
		adapter.mockImplementation((config) => new Promise((resolve) => (answer = () => resolve(ok(config, '{}')))));
		renderPage();

		const button = screen.getByRole('button', { name: 'Send' });
		// One act: both clicks land before React commits the disabled button.
		act(() => {
			button.click();
			button.click();
		});
		await waitFor(() => expect(adapter).toHaveBeenCalledTimes(1));

		await act(async () => answer(undefined));

		expect(await screen.findByText('200 OK')).toBeTruthy();
		expect(adapter).toHaveBeenCalledTimes(1);
	});

	it('asks before sending a component operation that only looks like a read', () => {
		renderPage();
		typeRequest('{"operation": "get_and_rotate_key"}');

		send();

		expect(screen.getByRole('alertdialog').textContent).toContain('Run get_and_rotate_key on this instance?');
		expect(adapter).not.toHaveBeenCalled();
	});

	it('refuses logout, which would end the session the rest of Studio is using', () => {
		renderPage();
		typeRequest('{"operation": "logout"}');

		send();

		expect(screen.getByRole('alert').textContent).toMatch(/^Sign out from Studio instead/);
		expect(screen.queryByRole('alertdialog')).toBeNull();
		expect(adapter).not.toHaveBeenCalled();
	});

	it('tracks a restart the way the Restart button does, until the instance answers again', async () => {
		adapter.mockImplementation(async (config) => ok(config, '{"message":"Restarting HarperDB."}'));
		renderPage();
		typeRequest('{"operation": "restart"}');
		send();

		fireEvent.click(screen.getByRole('button', { name: 'Run restart' }));

		expect(await screen.findByText('200 OK')).toBeTruthy();
		expect(markRestarting).toHaveBeenCalledWith(['ins-1'], expect.objectContaining({ reach: 'down' }));
		expect(adapter.mock.calls[0][0].skipRestartGate).toBe(true);
		expect(releaseRestart).not.toHaveBeenCalled();

		await act(async () => restartSettles.resolve());

		expect(releaseRestart).toHaveBeenCalledTimes(1);
	});

	it('stops tracking a restart Harper refused', async () => {
		adapter.mockImplementation(async (config) => {
			const response = { status: 403, statusText: 'Forbidden', data: '{"error":"no"}', headers: {}, config };
			throw new AxiosError(
				'Request failed with status code 403',
				AxiosError.ERR_BAD_REQUEST,
				config,
				undefined,
				response,
			);
		});
		renderPage();
		typeRequest('{"operation": "restart"}');
		send();

		fireEvent.click(screen.getByRole('button', { name: 'Run restart' }));

		expect(await screen.findByText('403 Forbidden')).toBeTruthy();
		expect(releaseRestart).toHaveBeenCalledTimes(1);
	});

	it('keeps tracking a restart whose answer a gateway lost, and still marks data stale', async () => {
		adapter.mockImplementation(async (config) => {
			const response = { status: 502, statusText: 'Bad Gateway', data: '', headers: {}, config };
			throw new AxiosError(
				'Request failed with status code 502',
				AxiosError.ERR_BAD_RESPONSE,
				config,
				undefined,
				response,
			);
		});
		renderPage();
		typeRequest('{"operation": "restart"}');
		send();

		fireEvent.click(screen.getByRole('button', { name: 'Run restart' }));

		expect(await screen.findByText('502 Bad Gateway')).toBeTruthy();
		expect(releaseRestart).not.toHaveBeenCalled();
		expect(invalidateEntityQueries).toHaveBeenCalledWith(expect.anything(), 'ins-1', { refetchType: 'none' });

		await act(async () => restartSettles.resolve());

		expect(releaseRestart).toHaveBeenCalledTimes(1);
	});

	it('starts over when the page switches to another instance, so nothing written for one reaches the next', () => {
		const page = renderPage();
		typeRequest('{"operation": "drop_table", "database": "dev", "table": "dog"}');
		send();
		expect(screen.getByRole('alertdialog')).toBeTruthy();

		state.entityId = 'ins-2';
		page.rerenderPage();

		expect(screen.queryByRole('alertdialog')).toBeNull();
		expect((screen.getByLabelText('Operation request') as HTMLTextAreaElement).value).toContain('describe_all');
		expect(adapter).not.toHaveBeenCalled();
	});

	it('still marks data stale for a write it stopped waiting on when the page went away', async () => {
		adapter.mockImplementation((config) =>
			new Promise((_resolve, reject) => {
				(config.signal as AbortSignal).addEventListener('abort', () => reject(new CanceledError(undefined, config)));
			})
		);
		const page = renderPage();
		typeRequest('{"operation": "insert", "database": "dev", "table": "dog", "records": [{"name": "Harper"}]}');
		send();
		fireEvent.click(screen.getByRole('button', { name: 'Run insert' }));
		await waitFor(() => expect(adapter).toHaveBeenCalledTimes(1));

		page.unmount();

		await waitFor(() =>
			expect(invalidateEntityQueries).toHaveBeenCalledWith(expect.anything(), 'ins-1', { refetchType: 'none' })
		);
	});

	it('sends a non-super user back to Databases', () => {
		state.canManage = false;
		renderPage();

		expect(screen.getByTestId('redirect').textContent).toBe('/org-1/clu-1/instance/ins-1/databases');
		expect(screen.queryByRole('button', { name: 'Send' })).toBeNull();
	});

	it('waits for the instance user before deciding to redirect', () => {
		state.canManage = false;
		state.user = null;
		renderPage();

		expect(screen.queryByTestId('redirect')).toBeNull();
		expect(screen.queryByRole('button', { name: 'Send' })).toBeNull();
	});
});
