/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { get, patch } = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn() }));
let granted = new Set<string>();
let canRestart = false;
const restartChecks: Array<string | undefined> = [];

vi.mock('@/config/apiClient', () => ({ apiClient: { get, patch } }));
vi.mock('@/hooks/useAuth', () => ({ useStaffPermission: (permission: string) => granted.has(permission) }));
vi.mock('@/hooks/usePermissions', () => ({
	useContainerOpsPermission: (organizationId?: string) => {
		restartChecks.push(organizationId);
		return canRestart;
	},
}));
vi.mock('@/hooks/useDebounce', () => ({ useDebounce: <T,>(value: T) => value }));

import { MonitoringPolicyAdminIndex } from './index';

const NOTIFY_ROW = {
	clusterId: 'clu-1',
	clusterName: 'perf-smoke',
	organizationId: 'org-1',
	organizationName: 'Smoke Industries',
	monitoringPolicy: 'notify',
	reason: 'load tests page the on-call',
	setBy: 'smoke-staff',
	setAt: '2026-10-20T14:15:25.884Z',
	history: [
		{ monitoringPolicy: 'page', reason: 'back to paging', setBy: 'a', setAt: '2026-10-19T10:00:00.000Z' },
		{
			monitoringPolicy: 'notify',
			reason: 'load tests page the on-call',
			setBy: 'smoke-staff',
			setAt: '2026-10-20T14:15:25.884Z',
		},
	],
	checkProjection: { setAt: null, finishedAt: '2026-10-20T14:15:25.896Z', errors: [], skipped: 'local' },
};
const SEARCH_MATCH = {
	clusterId: 'clu-2',
	clusterName: 'prod-api',
	clusterStatus: 'RUNNING',
	organizationId: 'org-1',
	organizationName: 'Smoke Industries',
	monitoringPolicy: 'page',
	reason: null,
	setBy: null,
	setAt: null,
};

beforeAll(() => {
	// Radix Dialog and RadioGroup rely on DOM APIs jsdom doesn't implement.
	Element.prototype.hasPointerCapture ??= () => false;
	Element.prototype.setPointerCapture ??= () => undefined;
	Element.prototype.releasePointerCapture ??= () => undefined;
	Element.prototype.scrollIntoView ??= () => undefined;
	globalThis.ResizeObserver ??= class {
		observe() {}
		unobserve() {}
		disconnect() {}
	};
});

beforeEach(() => {
	granted = new Set(['cluster:read', 'monitoringPolicy:write']);
	canRestart = false;
	restartChecks.length = 0;
	get.mockReset();
	patch.mockReset();
	get.mockImplementation(async (url: string) => {
		if (url.includes('monitoringPolicy=notify')) { return { data: [NOTIFY_ROW] }; }
		if (url.includes('search=')) { return { data: [SEARCH_MATCH] }; }
		throw new Error(`unexpected GET ${url}`);
	});
	patch.mockResolvedValue({
		data: {
			clusterId: 'clu-2',
			monitoringPolicy: 'notify',
			apply: 'none',
			instanceIds: ['ins-1', 'ins-2'],
			projectionErrors: [],
			restart: null,
			applyError: null,
		},
	});
});
afterEach(cleanup);

function renderPage() {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return render(
		<QueryClientProvider client={queryClient}>
			<MonitoringPolicyAdminIndex />
		</QueryClientProvider>,
	);
}

async function pickClusterFromSearch() {
	await act(async () => {
		fireEvent.click(await screen.findByRole('button', { name: /Set policy/ }));
	});
	await act(async () => {
		fireEvent.change(screen.getByLabelText('Cluster'), { target: { value: ' prod ' } });
	});
	await act(async () => {
		fireEvent.click(await screen.findByRole('button', { name: /prod-api/ }));
	});
}

describe('MonitoringPolicyAdminIndex', () => {
	it('lists the notify clusters with whether their checks took the change', async () => {
		renderPage();
		expect(await screen.findByText('perf-smoke')).toBeTruthy();
		expect(screen.getByText('load tests page the on-call')).toBeTruthy();
		expect(screen.getByText('Not stamped')).toBeTruthy();
		expect(get).toHaveBeenCalledWith('/Admin/ClusterMonitoringPolicy/?monitoringPolicy=notify');
	});

	it('shows history newest first', async () => {
		renderPage();
		await act(async () => {
			fireEvent.click(await screen.findByRole('button', { name: 'History' }));
		});
		const dialog = screen.getByRole('dialog');
		const reasons = within(dialog).getAllByText(/back to paging|load tests page the on-call/).map((node) =>
			node.textContent
		);
		expect(reasons).toEqual(['load tests page the on-call', 'back to paging']);
	});

	it('is read-only without monitoringPolicy:write', async () => {
		granted = new Set(['cluster:read']);
		renderPage();
		await screen.findByText('perf-smoke');
		expect(screen.queryByRole('button', { name: /Set policy/ })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Change' })).toBeNull();
		expect(screen.getByRole('button', { name: 'History' })).toBeTruthy();
	});

	it('searches with a trimmed term, then sets the policy with a required reason', async () => {
		renderPage();
		await pickClusterFromSearch();
		expect(get).toHaveBeenCalledWith('/Admin/ClusterMonitoringPolicy/?search=prod');

		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Set to notify' }));
		});
		expect(screen.getByText(/Give a reason/)).toBeTruthy();
		expect(patch).not.toHaveBeenCalled();

		await act(async () => {
			fireEvent.change(screen.getByLabelText('Reason'), { target: { value: '  perf cluster  ' } });
		});
		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Set to notify' }));
		});
		expect(patch).toHaveBeenCalledWith('/Admin/ClusterMonitoringPolicy/clu-2', {
			monitoringPolicy: 'notify',
			reason: 'perf cluster',
			apply: 'none',
		});
		expect(await screen.findByText(/on 2 instances/)).toBeTruthy();
	});

	it('offers the rolling restart only to an account that may restart the cluster', async () => {
		renderPage();
		await pickClusterFromSearch();
		expect(screen.getByRole('radio', { name: /Rolling restart now/ }).hasAttribute('disabled')).toBe(true);
		expect(screen.getByText('Needs instance:update.')).toBeTruthy();
		expect(new Set(restartChecks)).toEqual(new Set(['org-1']));
	});

	it('sends apply: rolling and reports a restart the server refused', async () => {
		canRestart = true;
		patch.mockResolvedValue({
			data: {
				clusterId: 'clu-2',
				monitoringPolicy: 'notify',
				apply: 'rolling',
				instanceIds: ['ins-1'],
				projectionErrors: [],
				restart: null,
				applyError: 'Cluster is already RESTARTING',
			},
		});
		renderPage();
		await pickClusterFromSearch();
		await act(async () => {
			fireEvent.click(screen.getByRole('radio', { name: /Rolling restart now/ }));
			fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'chaos run' } });
		});
		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Set to notify' }));
		});
		expect(patch.mock.calls[0][1]).toMatchObject({ apply: 'rolling' });
		expect(await screen.findByText(/Restart did not start: Cluster is already RESTARTING/)).toBeTruthy();
	});

	it('changing a listed cluster skips the search and defaults to the other policy', async () => {
		renderPage();
		await act(async () => {
			fireEvent.click(await screen.findByRole('button', { name: 'Change' }));
		});
		expect(screen.queryByLabelText('Cluster')).toBeNull();
		expect(screen.queryByRole('button', { name: 'Change cluster' })).toBeNull();
		await act(async () => {
			fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'load test over' } });
		});
		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Set to page' }));
		});
		await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
		expect(patch.mock.calls[0]).toEqual([
			'/Admin/ClusterMonitoringPolicy/clu-1',
			{ monitoringPolicy: 'page', reason: 'load test over', apply: 'none' },
		]);
	});

	it('never claims every cluster pages when the list could not be read', async () => {
		get.mockRejectedValue(new Error('503'));
		renderPage();
		expect(await screen.findByText('Could not load the clusters on notify.')).toBeTruthy();
		expect(screen.queryByText(/every cluster pages/)).toBeNull();
	});

	it('keeps the dialog open while a save is in flight, so its outcome is shown', async () => {
		let answer: (value: unknown) => void = () => {};
		patch.mockReturnValue(new Promise((resolve) => (answer = resolve)));
		renderPage();
		await pickClusterFromSearch();
		await act(async () => {
			fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'chaos run' } });
		});
		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Set to notify' }));
		});
		// TanStack flips isPending on a later tick, not inside the click.
		await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel' }).hasAttribute('disabled')).toBe(true));
		expect(screen.getByRole('button', { name: 'Change cluster' }).hasAttribute('disabled')).toBe(true);
		expect(screen.getByRole('button', { name: /Set policy/, hidden: true }).hasAttribute('disabled')).toBe(true);
		await act(async () => {
			fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
		});
		expect(screen.getByRole('dialog')).toBeTruthy();

		await act(async () => {
			answer({
				data: {
					clusterId: 'clu-2',
					monitoringPolicy: 'notify',
					apply: 'rolling',
					instanceIds: ['ins-1'],
					projectionErrors: [{ target: 'instance:ins-2', error: null }],
					restart: { status: 'RESTARTING' },
					applyError: null,
				},
			});
		});
		expect(await screen.findByText('Rolling restart started.')).toBeTruthy();
		expect(screen.getByText(/instance:ins-2 \(failed\)/)).toBeTruthy();
	});
});
