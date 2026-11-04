/**
 * @vitest-environment jsdom
 */
import type { WorkflowDetail } from '@/features/admin/workflows/workflowAdminApi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
