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

vi.mock('@tanstack/react-router', () => ({
	Link: ({ to, params, children }: { to: string; params: { workflowId: string }; children: React.ReactNode }) => (
		<a href={to.replace('$workflowId', params.workflowId)}>{children}</a>
	),
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
	pause: { reason: 'failed' },
	failedInstanceIds: ['ins-2'],
	acceptedCommands: ['retry', 'abandon'],
};
/** Customer reads answer `row`; the cluster still names wf-1. */
const customerSees = (row: Partial<ClusterWorkflow> | null) =>
	mockedGet.mockImplementation(async (url: string) => {
		if (isCustomerRead(url)) {
			if (!row) { throw notFound(); }
			return { data: { ...stopped, ...row } };
		}
		return { data: { id: 'clu-1', workflowId: 'wf-1', instances: [{ id: 'ins-2', name: 'eu-1.dc.example.dev' }] } };
	});

function renderNotice(workflowId: string | null = 'wf-1') {
	const client = new QueryClient();
	return render(
		<QueryClientProvider client={client}>
			<ClusterWorkflowNotice clusterId="clu-1" workflowId={workflowId} />
		</QueryClientProvider>,
	);
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

	describe('a customer’s stopped workflow', () => {
		beforeEach(() => {
			auth.canRead = false;
		});

		it('says what stopped and offers retry and stop', async () => {
			customerSees({});
			renderNotice();
			expect(await screen.findByText('Harper version upgrade stopped')).toBeTruthy();
			expect(await screen.findByText(/Instance eu-1.dc.example.dev didn’t finish updating/)).toBeTruthy();
			expect(screen.getByRole('button', { name: 'Retry update' })).toBeTruthy();
			expect(screen.getByRole('button', { name: 'Stop update' })).toBeTruthy();
		});

		it('prefers central manager’s own explanation', async () => {
			customerSees({ message: 'Instance ins-2 reported an error while starting.' });
			renderNotice();
			expect(await screen.findByText('Instance ins-2 reported an error while starting.')).toBeTruthy();
		});

		it('names an instance the cluster record doesn’t list by its id', async () => {
			customerSees({ failedInstanceIds: ['ins-9'] });
			renderNotice();
			expect(await screen.findByText(/Instance ins-9 didn’t finish updating/)).toBeTruthy();
		});

		it('counts several failed instances', async () => {
			customerSees({ failedInstanceIds: ['ins-2', 'ins-3'] });
			renderNotice();
			expect(await screen.findByText(/2 instances didn’t finish updating/)).toBeTruthy();
		});

		it('retries, then holds the buttons until the workflow is read again', async () => {
			customerSees({});
			renderNotice();
			fireEvent.click(await screen.findByRole('button', { name: 'Retry update' }));
			await waitFor(() => expect(mockedPost).toHaveBeenCalledWith('/Cluster/clu-1/workflow/retry', {}));
			expect(await screen.findByText(/Your request was sent/)).toBeTruthy();
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

		it('offers only what central manager accepts', async () => {
			customerSees({ acceptedCommands: ['retry'] });
			renderNotice();
			expect(await screen.findByRole('button', { name: 'Retry update' })).toBeTruthy();
			expect(screen.queryByRole('button', { name: 'Stop update' })).toBeNull();
		});

		it('ignores commands it doesn’t know', async () => {
			customerSees({ acceptedCommands: ['undo' as never] });
			renderNotice();
			expect(await screen.findByText('Harper version upgrade stopped')).toBeTruthy();
			expect(screen.queryByRole('button')).toBeNull();
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

		it('falls back to the plain state on a central manager without the endpoint', async () => {
			customerSees(null);
			renderNotice();
			await waitFor(() => expect(mockedGet.mock.calls.some(([url]) => isCustomerRead(url))).toBe(true));
			expect(screen.getByText('Update in progress')).toBeTruthy();
		});
	});
});
