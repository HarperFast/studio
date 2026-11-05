/**
 * @vitest-environment jsdom
 */
import { apiClient } from '@/config/apiClient';
import type { WorkflowRow } from '@/features/admin/workflows/workflowAdminApi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { AxiosError } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClusterWorkflowNotice } from './ClusterWorkflowNotice';

vi.mock('@/config/apiClient', () => ({ apiClient: { get: vi.fn() } }));
const mockedGet = vi.mocked(apiClient.get);

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
		mockedGet.mockReset();
		mockedGet.mockImplementation(async (url: string) => {
			if (isWorkflowRead(url)) { return { data: [{ ...upgrade, id: 'wf-other' }, upgrade] }; }
			return { data: { id: 'clu-1', workflowId: 'wf-1' } };
		});
	});
	afterEach(cleanup);

	it('renders nothing while no workflow holds the cluster', () => {
		const { container } = renderNotice(null);
		expect(container.textContent).toBe('');
	});

	it('shows customers the plain state and never asks for the workflow', async () => {
		auth.canRead = false;
		renderNotice();
		expect(screen.getByText('Update in progress')).toBeTruthy();
		expect(screen.queryByText(/wf-1/)).toBeNull();
		await waitFor(() => expect(mockedGet).toHaveBeenCalled());
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
});
