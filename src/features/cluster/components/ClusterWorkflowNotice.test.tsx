/**
 * @vitest-environment jsdom
 */
import { apiClient } from '@/config/apiClient';
import type { WorkflowRow } from '@/features/admin/workflows/workflowAdminApi';
import type { ClusterWorkflow } from '@/features/cluster/queries/clusterWorkflow';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AxiosError, AxiosHeaders } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClusterWorkflowNotice } from './ClusterWorkflowNotice';

vi.mock('@/config/apiClient', () => ({ apiClient: { get: vi.fn(), post: vi.fn() } }));
const mockedGet = vi.mocked(apiClient.get);
const mockedPost = vi.mocked(apiClient.post);
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }));
const perms = vi.hoisted(() => ({ update: true }));
vi.mock('@/hooks/usePermissions', () => ({ useOrganizationClusterPermissions: () => perms }));

const auth = vi.hoisted(() => ({ canRead: false }));
vi.mock('@/hooks/useAuth', () => ({ useStaffPermission: () => auth.canRead }));

const location = vi.hoisted(() => ({ pathname: '/org-1/clu-1/instances' }));
vi.mock('@tanstack/react-router', () => ({
	Link: ({ to, params, children }: { to: string; params: Record<string, string>; children: React.ReactNode }) => (
		<a href={to.replace(/\$(\w+)/g, (_match, name: string) => params[name])}>{children}</a>
	),
	useParams: () => ({ organizationId: 'org-1' }),
	useLocation: ({ select }: { select: (value: { pathname: string }) => unknown }) => select(location),
}));

vi.mock('@/lib/restart/restartTracker', () => ({ nextObservationStamp: () => 0, syncRestartsFromCluster: () => {} }));

const upgrade: WorkflowRow = {
	id: 'wf-1',
	type: 'UPDATE_HARPER_VERSION',
	status: 'RUNNING',
	phase: 'run',
	clusterId: 'clu-1',
	step: 'batch/b2/members/ins-2/waitUntilRunning',
	state: { batchIds: ['b1', 'b2'], batches: { b1: ['ins-1'], b2: ['ins-2'] }, lastBatchFinished: 'b1' },
};
const isWorkflowRead = (url: unknown) => String(url).startsWith('/Admin/Workflow/');
const isCustomerRead = (url: unknown) => String(url) === '/Cluster/clu-1/workflow';
const notFound = () =>
	new AxiosError('Request failed with status code 404', '404', undefined, undefined, {
		status: 404,
		statusText: 'Not Found',
		data: {},
		headers: {},
		config: { headers: new AxiosHeaders() },
	});
const stopped: ClusterWorkflow = {
	id: 'wf-1',
	type: 'UPDATE_HARPER_VERSION',
	status: 'PAUSED',
	phase: 'run',
	pause: { reason: 'unknown' },
	failedInstanceIds: ['ins-2'],
	acceptedCommands: ['retry', 'abandon'],
};
const instances = [
	{ id: 'ins-1', name: 'us-1.dc.example.dev', status: 'RUNNING', version: '5.3.2' },
	{ id: 'ins-2', name: 'eu-1.dc.example.dev', status: 'FAILED', version: '5.3.0' },
];
/** Customer reads answer `row` (a function of the call count, if it changes); the cluster is held by `heldBy`. */
const customerSees = (
	row: Partial<ClusterWorkflow> | null | ((call: number) => Partial<ClusterWorkflow>),
	{ heldBy = 'wf-1' as string | null, clusterInstances = instances as unknown[], pinned = [] as string[] } = {},
) => {
	let calls = 0;
	mockedGet.mockImplementation(async (url: string) => {
		if (String(url) === '/HarperVersions/') {
			return { data: { value: pinned.map((version) => ({ name: `org-${version}`, version, scoped: true })) } };
		}
		if (isCustomerRead(url)) {
			if (!row) { throw notFound(); }
			return { data: { ...stopped, ...(typeof row === 'function' ? row(++calls) : row) } };
		}
		return { data: { id: 'clu-1', workflowId: heldBy, instances: clusterInstances } };
	});
};

let client = new QueryClient();
const noticeTree = (workflowId: string | null = 'wf-1') => (
	<QueryClientProvider client={client}>
		<ClusterWorkflowNotice clusterId="clu-1" workflowId={workflowId} />
	</QueryClientProvider>
);
function renderNotice(workflowId: string | null = 'wf-1') {
	client = new QueryClient();
	return render(noticeTree(workflowId));
}

describe('ClusterWorkflowNotice', () => {
	beforeEach(() => {
		perms.update = true;
		mockedPost.mockReset();
		mockedPost.mockResolvedValue({ data: {} });
		mockedGet.mockReset();
		mockedGet.mockImplementation(async (url: string) => {
			if (isWorkflowRead(url)) { return { data: [{ ...upgrade, id: 'wf-other' }, upgrade] }; }
			if (isCustomerRead(url)) {
				return { data: { ...stopped, status: 'RUNNING', pause: null, acceptedCommands: [] } };
			}
			return { data: { id: 'clu-1', workflowId: 'wf-1' } };
		});
	});
	afterEach(cleanup);

	it('renders nothing while no workflow holds the cluster', () => {
		const { container } = renderNotice(null);
		expect(container.textContent).toBe('');
	});

	it('shows customers the plain state while it runs, and never asks the admin endpoint', async () => {
		auth.canRead = false;
		renderNotice();
		expect(screen.getByText('Update in progress')).toBeTruthy();
		await waitFor(() => expect(mockedGet.mock.calls.some(([url]) => isCustomerRead(url))).toBe(true));
		expect(screen.getByText('Update in progress')).toBeTruthy();
		expect(screen.queryByText(/wf-1/)).toBeNull();
		expect(mockedGet.mock.calls.some(([url]) => isWorkflowRead(url))).toBe(false);
	});

	it('shows staff the step and batch from the cluster’s active row, with a link to the workflow', async () => {
		auth.canRead = true;
		renderNotice();
		await waitFor(() => expect(mockedGet).toHaveBeenCalledWith('/Admin/Workflow/?active=true&clusterId=clu-1'));
		expect(await screen.findByText('Harper version upgrade in progress')).toBeTruthy();
		expect(screen.getByText(/running · batch 2 of 2, member 1 of 1: waitUntilRunning/)).toBeTruthy();
		expect(screen.getByRole('link').getAttribute('href')).toBe('/admin/workflows/wf-1');
	});

	it('says how far an undoing upgrade got, not that every batch finished', async () => {
		auth.canRead = true;
		mockedGet.mockImplementation(async (url: string) =>
			isWorkflowRead(url)
				? {
					data: [{
						...upgrade,
						status: 'UNDOING',
						phase: 'undo',
						state: { batchIds: ['b1', 'b2', 'b3'], lastBatchFinished: 'b1' },
					}],
				}
				: { data: {} }
		);
		renderNotice();
		expect(await screen.findByText(/1 of 3 batches finished/)).toBeTruthy();
	});

	it('still names the step of a workflow without batches', async () => {
		auth.canRead = true;
		mockedGet.mockImplementation(async (url: string) =>
			isWorkflowRead(url)
				? {
					data: [{ ...upgrade, type: 'UPDATE_RECORD_LOCKS', step: 'restartInstances', state: { recordLocks: true } }],
				}
				: { data: {} }
		);
		renderNotice();
		expect(await screen.findByText(/running · restartInstances/)).toBeTruthy();
	});

	it('falls back to the plain state for staff when the workflow cannot be read', async () => {
		auth.canRead = true;
		mockedGet.mockImplementation(async (url: string) => {
			if (isWorkflowRead(url)) { throw new AxiosError('Request failed with status code 503'); }
			return { data: { id: 'clu-1', workflowId: 'wf-1' } };
		});
		renderNotice();
		await waitFor(() => expect(mockedGet.mock.calls.some(([url]) => isWorkflowRead(url))).toBe(true));
		expect(screen.getByText('Update in progress')).toBeTruthy();
	});

	it('falls back to the plain state when the cluster’s workflow is not in the active list', async () => {
		auth.canRead = true;
		mockedGet.mockImplementation(async (url: string) =>
			isWorkflowRead(url) ? { data: [{ ...upgrade, id: 'wf-other' }] } : { data: {} }
		);
		renderNotice();
		await waitFor(() => expect(mockedGet.mock.calls.some(([url]) => isWorkflowRead(url))).toBe(true));
		expect(screen.getByText('Update in progress')).toBeTruthy();
	});

	describe('a customer’s paused workflow', () => {
		beforeEach(() => {
			auth.canRead = false;
		});

		it('says what stopped, by instance name, and offers retry and stop', async () => {
			customerSees({});
			renderNotice();
			expect(await screen.findByText('Harper version upgrade stopped')).toBeTruthy();
			expect(await screen.findByText('Instance eu-1.dc.example.dev didn’t finish updating.')).toBeTruthy();
			expect(screen.getByRole('button', { name: 'Retry update' })).toBeTruthy();
			expect(screen.getByRole('button', { name: 'Stop update' })).toBeTruthy();
		});

		it('names an instance the cluster record doesn’t list by its id, and counts several', async () => {
			customerSees({ failedInstanceIds: ['ins-9'] });
			const { unmount } = renderNotice();
			expect(await screen.findByText(/Instance ins-9 didn’t finish updating/)).toBeTruthy();
			unmount();
			customerSees({ failedInstanceIds: ['ins-2', 'ins-3'] });
			renderNotice();
			expect(await screen.findByText(/2 instances didn’t finish updating/)).toBeTruthy();
		});

		it('uses central manager’s message when it names no instance', async () => {
			customerSees({ failedInstanceIds: [], message: 'Putting the cluster back in service failed.' });
			renderNotice();
			expect(await screen.findByText('Putting the cluster back in service failed.')).toBeTruthy();
		});

		it('explains a failed cleanup with nothing else to go on', async () => {
			customerSees({ failedInstanceIds: [], pause: { reason: 'finalize-failed' }, acceptedCommands: ['retry'] });
			renderNotice();
			expect(await screen.findByText(/last step didn’t finish/)).toBeTruthy();
			expect(screen.queryByRole('button', { name: 'Stop update' })).toBeNull();
		});

		it('retries, then holds the buttons until the workflow is read again', async () => {
			customerSees((call) => (call > 1 ? { command: { action: 'retry' }, acceptedCommands: [] } : {}));
			renderNotice();
			fireEvent.click(await screen.findByRole('button', { name: 'Retry update' }));
			await waitFor(() => expect(mockedPost).toHaveBeenCalledWith('/Cluster/clu-1/workflow/retry', {}));
			expect(await screen.findByText(/Your request was sent/)).toBeTruthy();
			expect(screen.queryByRole('button', { name: 'Retry update' })).toBeNull();
		});

		it('asks before stopping, and sends nothing on cancel', async () => {
			customerSees({});
			renderNotice();
			fireEvent.click(await screen.findByRole('button', { name: 'Stop update' }));
			expect(screen.getByRole('dialog', { name: 'Stop the update?' })).toBeTruthy();
			fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
			expect(screen.queryByRole('dialog')).toBeNull();
			expect(mockedPost).not.toHaveBeenCalled();
		});

		it('stops once confirmed', async () => {
			customerSees({});
			renderNotice();
			fireEvent.click(await screen.findByRole('button', { name: 'Stop update' }));
			const dialog = screen.getByRole('dialog');
			fireEvent.click(Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent === 'Stop update')!);
			await waitFor(() => expect(mockedPost).toHaveBeenCalledWith('/Cluster/clu-1/workflow/abandon', {}));
			await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
		});

		it('closes the confirmation when central manager stops accepting abandon', async () => {
			customerSees({});
			const { rerender } = renderNotice();
			fireEvent.click(await screen.findByRole('button', { name: 'Stop update' }));
			expect(screen.getByRole('dialog')).toBeTruthy();
			customerSees({ acceptedCommands: ['retry'] });
			await client.refetchQueries();
			rerender(noticeTree());
			await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
			expect(mockedPost).not.toHaveBeenCalled();
		});

		it('does not carry an open confirmation over to another workflow', async () => {
			customerSees({});
			const { rerender } = renderNotice();
			fireEvent.click(await screen.findByRole('button', { name: 'Stop update' }));
			customerSees({ id: 'wf-2' }, { heldBy: 'wf-2' });
			rerender(noticeTree('wf-2'));
			await waitFor(() => expect(screen.getByRole('button', { name: 'Stop update' })).toBeTruthy());
			expect(screen.queryByRole('dialog')).toBeNull();
		});

		it('offers only what central manager accepts, and ignores commands it doesn’t know', async () => {
			customerSees({ acceptedCommands: ['retry', 'undo' as never] });
			renderNotice();
			expect(await screen.findByRole('button', { name: 'Retry update' })).toBeTruthy();
			expect(screen.queryByRole('button', { name: 'Stop update' })).toBeNull();
		});

		it('explains without buttons to a user who can’t change the cluster', async () => {
			perms.update = false;
			customerSees({});
			renderNotice();
			expect(await screen.findByText(/Someone with permission to change this cluster can retry it/)).toBeTruthy();
			expect(screen.queryByRole('button')).toBeNull();
		});

		it('holds the buttons while an earlier command waits to be picked up', async () => {
			customerSees({ command: { action: 'retry', at: '2026-11-06T00:00:00Z' } });
			renderNotice();
			expect(await screen.findByText(/Your request was sent/)).toBeTruthy();
			expect(screen.getByRole('button', { name: 'Retry update' })).toHaveProperty('disabled', true);
		});

		it('says an operator pause is ours, with nothing to send', async () => {
			customerSees({ pause: { reason: 'command' }, acceptedCommands: [] });
			renderNotice();
			expect(await screen.findByText('Harper version upgrade paused')).toBeTruthy();
			expect(screen.getByText('Our team paused it.')).toBeTruthy();
			expect(screen.queryByRole('button')).toBeNull();
		});

		it('shows the plain state for another workflow’s row', async () => {
			customerSees({ id: 'wf-old', status: 'UNDONE' });
			renderNotice();
			await waitFor(() => expect(mockedGet.mock.calls.some(([url]) => isCustomerRead(url))).toBe(true));
			expect(screen.getByText('Update in progress')).toBeTruthy();
		});

		it('falls back to the plain state on a central manager without the endpoint', async () => {
			customerSees(null);
			renderNotice();
			await waitFor(() => expect(mockedGet.mock.calls.some(([url]) => isCustomerRead(url))).toBe(true));
			expect(screen.getByText('Update in progress')).toBeTruthy();
		});
	});

	describe('an upgrade that ended part way', () => {
		const ended = {
			id: 'wf-1',
			status: 'UNDONE',
			pause: null,
			acceptedCommands: [],
			message: 'instance ins-2 is ERROR',
		};
		beforeEach(() => {
			auth.canRead = false;
			location.pathname = '/org-1/clu-1/instances';
		});

		it('says what didn’t finish and points at the Version page', async () => {
			customerSees(ended, { heldBy: null });
			renderNotice(null);
			expect(await screen.findByText('The last Harper version upgrade didn’t finish')).toBeTruthy();
			expect(
				screen.getByText(
					/Instance eu-1.dc.example.dev didn’t finish updating. 1 of 2 instances is still behind 5.3.2./,
				),
			)
				.toBeTruthy();
			expect(screen.getByRole('link', { name: 'Run the upgrade again from Version' }).getAttribute('href'))
				.toBe('/org-1/clu-1/edit/version');
		});

		it('names no target when the lagging version is pinned to the organization', async () => {
			customerSees(ended, { heldBy: null, pinned: ['5.3.0'] });
			renderNotice(null);
			expect(await screen.findByText(/1 of 2 instances run a different version from the rest/)).toBeTruthy();
			expect(screen.getByRole('link', { name: 'Choose a version on the Version page' })).toBeTruthy();
		});

		it('shows staff the same, since nothing holds the cluster', async () => {
			auth.canRead = true;
			customerSees(ended, { heldBy: null });
			renderNotice(null);
			expect(await screen.findByText('The last Harper version upgrade didn’t finish')).toBeTruthy();
		});

		it('leaves the link off on the Version page itself', async () => {
			location.pathname = '/org-1/clu-1/edit/version';
			customerSees(ended, { heldBy: null });
			renderNotice(null);
			expect(await screen.findByText('The last Harper version upgrade didn’t finish')).toBeTruthy();
			expect(screen.queryByRole('link')).toBeNull();
		});

		it('tells a user who can’t change the cluster who can', async () => {
			perms.update = false;
			customerSees(ended, { heldBy: null });
			renderNotice(null);
			expect(await screen.findByText(/Someone with permission to change this cluster can run it again/)).toBeTruthy();
			expect(screen.queryByRole('link')).toBeNull();
		});

		it('says nothing once the last upgrade succeeded', async () => {
			customerSees({ ...ended, status: 'SUCCEEDED' }, { heldBy: null });
			const { container } = renderNotice(null);
			await waitFor(() => expect(mockedGet.mock.calls.some(([url]) => isCustomerRead(url))).toBe(true));
			expect(container.textContent).toBe('');
		});

		it('doesn’t ask about a cluster whose instances all run one version', async () => {
			customerSees(ended, { heldBy: null, clusterInstances: [instances[0], { ...instances[1], version: '5.3.2' }] });
			const { container } = renderNotice(null);
			await waitFor(() => expect(mockedGet).toHaveBeenCalled());
			expect(mockedGet.mock.calls.some(([url]) => isCustomerRead(url))).toBe(false);
			expect(container.textContent).toBe('');
		});
	});
});
