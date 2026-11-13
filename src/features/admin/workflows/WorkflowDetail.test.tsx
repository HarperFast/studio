/**
 * @vitest-environment jsdom
 */
import type { WorkflowDetail } from '@/features/admin/workflows/workflowAdminApi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkflowDetailPage } from './WorkflowDetail';

vi.mock('@/config/apiClient', () => ({ apiClient: { get: vi.fn(() => new Promise(() => {})), post: vi.fn() } }));
const auth = vi.hoisted(() => ({ canManage: true }));
vi.mock('@/hooks/useAuth', () => ({
	useStaffPermission: (permission: string) => permission !== 'workflow:manage' || auth.canManage,
}));

const route = vi.hoisted(() => ({ workflowId: 'wf-a' }));
vi.mock('@tanstack/react-router', () => ({
	useParams: () => ({ workflowId: route.workflowId }),
	Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));

const detail = (id: string): WorkflowDetail => ({
	id,
	type: 'UPDATE_HARPER_VERSION',
	status: 'RUNNING',
	phase: 'run',
	definitionRegistered: true,
	plan: [],
	items: [],
	children: [],
	events: [],
	acceptedCommands: ['pause', 'abandon'],
});

describe('WorkflowDetailPage', () => {
	afterEach(cleanup);

	// Back between two cached workflows reuses the route component, so nothing local may carry across.
	it('closes an open Abandon dialog when the page moves to another workflow', () => {
		const client = new QueryClient();
		client.setQueryData(['fabric-admin', 'workflows', 'detail', 'wf-a'], detail('wf-a'));
		client.setQueryData(['fabric-admin', 'workflows', 'detail', 'wf-b'], detail('wf-b'));
		const page = () => (
			<QueryClientProvider client={client}>
				<WorkflowDetailPage />
			</QueryClientProvider>
		);
		route.workflowId = 'wf-a';
		const { rerender } = render(page());
		fireEvent.click(screen.getByRole('button', { name: 'Abandon' }));
		fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'meant for a' } });
		expect(screen.getByRole('dialog')).toBeTruthy();

		route.workflowId = 'wf-b';
		rerender(page());
		expect(screen.getByText('wf-b')).toBeTruthy();
		expect(screen.queryByRole('dialog')).toBeNull();
	});

	const batchDetail = (state: unknown): WorkflowDetail => ({
		...detail('wf-a'),
		state,
		plan: [{
			path: 'batch',
			kind: 'forEach-steps',
			parallel: false,
			pointOfNoReturn: false,
			undo: 'function',
			maxDuration: null,
			status: 'running',
		}],
		items: [{ id: 'root', workflowId: 'wf-a', stepPath: 'batch', status: 'running', receipt: { items: ['b1', 'b2'] } }],
	});

	function renderBatchDetail(state: unknown) {
		const client = new QueryClient();
		client.setQueryData(['fabric-admin', 'workflows', 'detail', 'wf-a'], batchDetail(state));
		route.workflowId = 'wf-a';
		render(
			<QueryClientProvider client={client}>
				<WorkflowDetailPage />
			</QueryClientProvider>,
		);
	}

	it('identifies the current batch and each item group by their checkpoint instance IDs', () => {
		renderBatchDetail({ batchIds: ['b1', 'b2'], batches: { b1: ['ins-one', 'ins-two'], b2: ['ins-three'] } });
		expect(screen.getAllByText('ins-one, ins-two')).toHaveLength(2);
		expect(within(screen.getByRole('row', { name: /batch b1/ })).getByText('ins-one, ins-two')).toBeTruthy();
		expect(within(screen.getByRole('row', { name: /batch b2/ })).getByText('ins-three')).toBeTruthy();
	});

	it.each([undefined, {}, { batches: { b1: 'ins-one' } }, { batches: { b1: ['ins-one', null] } }, {
		batches: { b1: [] },
	}])(
		'keeps batch rows readable without valid membership: %j',
		(state) => {
			renderBatchDetail(state);
			expect(screen.getByRole('row', { name: /batch b1/ })).toBeTruthy();
			expect(screen.queryByText('ins-one')).toBeNull();
		},
	);

	function renderWorkflow(row: WorkflowDetail) {
		const client = new QueryClient();
		client.setQueryData(['fabric-admin', 'workflows', 'detail', 'wf-a'], row);
		route.workflowId = 'wf-a';
		render(
			<QueryClientProvider client={client}>
				<WorkflowDetailPage />
			</QueryClientProvider>,
		);
	}

	const batchPlan: NonNullable<WorkflowDetail['plan']> = [
		{
			path: 'batch',
			kind: 'forEach-steps',
			parallel: false,
			pointOfNoReturn: false,
			undo: 'function',
			maxDuration: null,
			status: 'running',
		},
		{
			path: 'batch/drainBatch',
			kind: 'step',
			parallel: false,
			pointOfNoReturn: false,
			undo: 'function',
			maxDuration: '5m',
			status: 'pending',
		},
		{
			path: 'batch/members',
			kind: 'forEach-steps',
			parallel: true,
			pointOfNoReturn: false,
			undo: 'function',
			maxDuration: null,
			status: 'pending',
		},
		{
			path: 'batch/members/update',
			kind: 'step',
			parallel: false,
			pointOfNoReturn: true,
			undo: 'none',
			maxDuration: '30m',
			status: 'pending',
		},
	];

	it('shows planned descendants before any execution, including nested groups', () => {
		renderWorkflow({ ...detail('wf-a'), plan: batchPlan });
		expect(screen.getByRole('heading', { name: 'Steps' })).toBeTruthy();
		expect(screen.queryByRole('heading', { name: 'Plan' })).toBeNull();
		expect(screen.queryByRole('heading', { name: 'Items' })).toBeNull();
		const table = screen.getByRole('table', { name: 'Workflow steps' });
		expect(within(table).getByText('drainBatch')).toBeTruthy();
		expect(within(table).getByText('update')).toBeTruthy();
		expect(within(table).getAllByText('not reached')).toHaveLength(4);
		fireEvent.click(screen.getByRole('button', { name: 'Collapse batch' }));
		expect(within(table).queryByText('update')).toBeNull();
		fireEvent.click(screen.getByRole('button', { name: 'Expand batch' }));
		expect(within(table).getByText('update')).toBeTruthy();
	});

	it('keeps point-of-no-return information in step details', () => {
		renderWorkflow({ ...detail('wf-a'), plan: batchPlan });
		const table = screen.getByRole('table', { name: 'Workflow steps' });
		expect(within(table).queryByText(/point of no return/i)).toBeNull();
		fireEvent.click(screen.getByRole('button', { name: 'Show details for update' }));
		expect(within(table).getByText('Point of no return')).toBeTruthy();
		expect(within(table).getByText('This step cannot be undone once applied.')).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: 'Hide details for update' }));
		expect(within(table).queryByText(/point of no return/i)).toBeNull();
	});

	it('combines plan metadata with executions and preserves collection receipts and historical steps', () => {
		const row = batchDetail({ batchIds: ['b1', 'b2'], batches: { b1: ['ins-one'], b2: ['ins-two'] } });
		renderWorkflow({
			...row,
			plan: batchPlan,
			items: [...row.items, { id: 'b1', workflowId: 'wf-a', stepPath: 'batch/b1', status: 'running' }, {
				id: 'drain',
				workflowId: 'wf-a',
				stepPath: 'batch/b1/drainBatch',
				status: 'failed',
				attempt: 2,
				error: { message: 'drain failed' },
				receipt: { drained: false },
			}, { id: 'old', workflowId: 'wf-a', stepPath: 'batch/b1/oldDrain', status: 'done' }],
		});
		const table = screen.getByRole('table', { name: 'Workflow steps' });
		fireEvent.click(screen.getByRole('button', { name: 'Show details for batch' }));
		expect(screen.getByLabelText('Step receipt').textContent).toContain('b2');
		fireEvent.click(screen.getByRole('button', { name: 'Hide details for batch' }));
		const failed = within(table).getByRole('row', { name: /drainBatch failed/ });
		fireEvent.click(within(failed).getByRole('button', { name: 'Show details for drainBatch' }));
		expect(screen.getByText('5m')).toBeTruthy();
		expect(screen.getByText('per batch')).toBeTruthy();
		expect(screen.getByLabelText('Step error').textContent).toContain('drain failed');
		expect(screen.getByLabelText('Step receipt').textContent).toContain('drained');
		fireEvent.click(screen.getByRole('button', { name: 'Collapse batch b1' }));
		expect(within(table).queryByRole('row', { name: /drainBatch failed/ })).toBeNull();
		expect(within(table).getByText('batch/b1/oldDrain')).toBeTruthy();
		expect(within(table).getByText('Not in current plan')).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: 'Expand batch b1' }));
		expect(screen.getByLabelText('Step error').textContent).toContain('drain failed');
	});

	it('keeps a historical path distinct from a planned template with the same path', () => {
		renderWorkflow({
			...detail('wf-a'),
			plan: batchPlan,
			items: [
				{ id: 'root', workflowId: 'wf-a', stepPath: 'batch', status: 'running', receipt: { items: [] } },
				{ id: 'old', workflowId: 'wf-a', stepPath: 'batch/drainBatch', status: 'done' },
			],
		});
		fireEvent.click(screen.getByRole('button', { name: 'Show details for drainBatch' }));
		expect(screen.getByRole('button', { name: 'Show details for batch/drainBatch' }).getAttribute('aria-expanded'))
			.toBe('false');
		fireEvent.click(screen.getByRole('button', { name: 'Show details for batch/drainBatch' }));
		expect(screen.getByText('This execution is not in the current plan.')).toBeTruthy();
		expect(screen.getByText('5m')).toBeTruthy();
	});

	it('shows recorded executions when the definition is unavailable', () => {
		renderWorkflow({
			...detail('wf-a'),
			plan: null,
			definitionRegistered: false,
			items: [
				{ id: 'old', workflowId: 'wf-a', stepPath: 'removed/step', status: 'done' },
			],
		});
		expect(screen.getByText('removed/step')).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: 'Show details for removed/step' }));
		expect(screen.getByText('This execution is not in the current plan.')).toBeTruthy();
	});

	it('lists every cluster a host-scoped workflow holds, with its scope', () => {
		renderWorkflow({ ...detail('wf-a'), scope: 'host:hst-1', clusterId: null, clusterIds: ['clu-a', 'clu-b'] });
		expect(screen.getByText('Clusters')).toBeTruthy();
		expect(screen.getByText('clu-a')).toBeTruthy();
		expect(screen.getByText('clu-b')).toBeTruthy();
		expect(screen.getByText('host:hst-1')).toBeTruthy();
	});

	it('shows a command that is waiting for the executor, to readers who cannot send one too', () => {
		auth.canManage = false;
		const client = new QueryClient();
		client.setQueryData(['fabric-admin', 'workflows', 'detail', 'wf-a'], {
			...detail('wf-a'),
			command: { action: 'pause', by: 'ops@example.com' },
		});
		route.workflowId = 'wf-a';
		render(
			<QueryClientProvider client={client}>
				<WorkflowDetailPage />
			</QueryClientProvider>,
		);
		expect(screen.getByText(/pause by ops@example.com, waiting for the next step boundary/)).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull();
		auth.canManage = true;
	});
});
