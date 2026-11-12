/**
 * @vitest-environment jsdom
 */
import { apiClient } from '@/config/apiClient';
import type { WorkflowRow } from '@/features/admin/workflows/workflowAdminApi';
import type { ClusterWorkflow } from '@/features/cluster/queries/clusterWorkflow';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { AxiosError, AxiosHeaders } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClusterWorkflowNotice } from './ClusterWorkflowNotice';

vi.mock('@/config/apiClient', () => ({ apiClient: { get: vi.fn(), post: vi.fn() } }));
const mockedGet = vi.mocked(apiClient.get);
const mockedPost = vi.mocked(apiClient.post);
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
};
const instances = [
	{ id: 'ins-1', name: 'us-1.dc.example.dev', status: 'RUNNING', version: '5.3.2' },
	{ id: 'ins-2', name: 'eu-1.dc.example.dev', status: 'FAILED', version: '5.3.0' },
];
const customerSees = (
	row: Partial<ClusterWorkflow> | null,
	{
		heldBy = 'wf-1' as string | null,
		clusterInstances = instances as unknown[],
		pinned = [] as string[] | null,
	} = {},
) => {
	mockedGet.mockImplementation(async (url: string) => {
		if (String(url) === '/HarperVersions/') {
			if (!pinned) { throw new AxiosError('Request failed with status code 503'); }
			return { data: { value: pinned.map((version) => ({ name: `org-${version}`, version, scoped: true })) } };
		}
		if (isCustomerRead(url)) {
			if (!row) { throw notFound(); }
			return { data: { ...stopped, ...row } };
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
				return { data: { ...stopped, status: 'RUNNING', pause: null } };
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

		it('says what stopped, by instance name, with nothing to send', async () => {
			customerSees({});
			renderNotice();
			expect(await screen.findByText('Harper version upgrade stopped')).toBeTruthy();
			expect(await screen.findByText('Instance eu-1.dc.example.dev didn’t finish updating.')).toBeTruthy();
			expect(screen.getByText('Other changes to this cluster wait until it continues.')).toBeTruthy();
			expect(screen.queryByRole('button')).toBeNull();
			expect(mockedPost).not.toHaveBeenCalled();
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
			customerSees({ failedInstanceIds: [], pause: { reason: 'finalize-failed' } });
			renderNotice();
			expect(await screen.findByText(/last step didn’t finish/)).toBeTruthy();
		});

		it('says an operator pause is ours', async () => {
			customerSees({ pause: { reason: 'command' } });
			renderNotice();
			expect(await screen.findByText('Harper version upgrade paused')).toBeTruthy();
			expect(screen.getByText('Our team paused it.')).toBeTruthy();
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
			message: 'Instance ins-2 did not come back after the update.',
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

		it('names no target when the pinned versions can’t be read', async () => {
			customerSees(ended, { heldBy: null, pinned: null });
			renderNotice(null);
			expect(await screen.findByText(/1 of 2 instances run a different version from the rest/)).toBeTruthy();
		});

		it('keeps the pinned versions it read when a refresh of them fails', async () => {
			customerSees(ended, { heldBy: null });
			renderNotice(null);
			expect(await screen.findByText(/1 of 2 instances is still behind 5.3.2./)).toBeTruthy();

			customerSees(ended, { heldBy: null, pinned: null });
			await act(async () => {
				await client.refetchQueries({ queryKey: ['org-1', 'HarperVersions'] });
				// React Query notifies observers on a timer.
				await new Promise((resolve) => setTimeout(resolve, 0));
			});
			expect(client.getQueryState(['org-1', 'HarperVersions'])?.status).toBe('error');

			expect(screen.getByText(/1 of 2 instances is still behind 5.3.2./)).toBeTruthy();
			expect(screen.getByRole('link', { name: 'Run the upgrade again from Version' })).toBeTruthy();
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
