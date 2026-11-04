/**
 * @vitest-environment jsdom
 */
import type { WorkflowDetail } from '@/features/admin/workflows/workflowAdminApi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkflowDetailPage } from './WorkflowDetail';

vi.mock('@/config/apiClient', () => ({ apiClient: { get: vi.fn(() => new Promise(() => {})), post: vi.fn() } }));
vi.mock('@/hooks/useAuth', () => ({ useStaffPermission: () => true }));

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

	// Regression: Back from one cached workflow to another reuses the route component, and an open Abandon dialog
	// (with its reason) used to carry over and abandon the workflow now on screen.
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
});
