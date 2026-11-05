/**
 * @vitest-environment jsdom
 */
import { apiClient } from '@/config/apiClient';
import type { WorkflowDetail } from '@/features/admin/workflows/workflowAdminApi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AbandonDialog, offeredCommands, WorkflowCommands } from './WorkflowCommands';

vi.mock('@/config/apiClient', () => ({ apiClient: { post: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }));
const mockedPost = vi.mocked(apiClient.post);

const auth = vi.hoisted(() => ({ canManage: true }));
vi.mock('@/hooks/useAuth', () => ({
	useStaffPermission: (permission: string) => permission !== 'workflow:manage' || auth.canManage,
}));

function detail(overrides: Partial<WorkflowDetail> = {}): WorkflowDetail {
	return {
		id: 'wf-1',
		type: 'UPDATE_HARPER_VERSION',
		status: 'RUNNING',
		definitionRegistered: true,
		plan: [],
		items: [],
		children: [],
		events: [],
		acceptedCommands: ['pause', 'undo', 'abandon'],
		...overrides,
	};
}

function renderWithClient(ui: React.ReactElement) {
	const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
	return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const buttonNames = () => screen.queryAllByRole('button').map((button) => button.textContent);

describe('offeredCommands', () => {
	it('offers exactly what the server accepts, in a fixed order', () => {
		expect(offeredCommands({ acceptedCommands: ['abandon', 'retry', 'undo'] }, true)).toEqual([
			'retry',
			'undo',
			'abandon',
		]);
	});

	it('offers nothing without workflow:manage', () => {
		expect(offeredCommands({ acceptedCommands: ['pause', 'abandon'] }, false)).toEqual([]);
	});

	it('ignores a command name Studio does not know', () => {
		expect(offeredCommands({ acceptedCommands: ['pause', 'explode' as never] }, true)).toEqual(['pause']);
	});
});

describe('WorkflowCommands', () => {
	beforeEach(() => {
		auth.canManage = true;
		mockedPost.mockReset();
		mockedPost.mockResolvedValue({ data: {} });
	});
	afterEach(cleanup);

	it.each(
		[
			['past the point of no return: no undo', ['pause', 'abandon'], ['Pause', 'Abandon']],
			['paused by an operator: resume', ['resume', 'undo', 'abandon'], ['Resume', 'Undo', 'Abandon']],
			['paused on a failure: retry, no resume', ['retry', 'undo', 'abandon'], ['Retry', 'Undo', 'Abandon']],
			['a child row: nothing', [], []],
		] as const,
	)('%s', (_case, accepted, buttons) => {
		renderWithClient(<WorkflowCommands detail={detail({ acceptedCommands: [...accepted] })} />);
		expect(buttonNames()).toEqual(buttons);
	});

	it('renders no commands for an account without workflow:manage', () => {
		auth.canManage = false;
		renderWithClient(<WorkflowCommands detail={detail()} />);
		expect(buttonNames()).toEqual([]);
	});

	it('sends a command to the workflow’s path', async () => {
		renderWithClient(<WorkflowCommands detail={detail()} />);
		fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
		await waitFor(() => expect(mockedPost).toHaveBeenCalledWith('/Admin/Workflow/wf-1/pause', {}));
	});

	it('holds every command while one is already pending', () => {
		renderWithClient(
			<WorkflowCommands detail={detail({ command: { action: 'pause', by: 'ops@example.com' } })} />,
		);
		for (const button of screen.getAllByRole('button')) { expect(button).toHaveProperty('disabled', true); }
	});

	it('stays held after a command is accepted until a read moves past the row it was sent from', async () => {
		const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
		const view = (row: WorkflowDetail) => (
			<QueryClientProvider client={client}>
				<WorkflowCommands detail={row} />
			</QueryClientProvider>
		);
		const before = detail({ updatedAt: '2026-11-04T20:00:00.000Z' });
		const { rerender } = render(view(before));
		fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
		await waitFor(() => expect(mockedPost).toHaveBeenCalled());
		await waitFor(() => expect(screen.getByRole('button', { name: 'Pause' })).toHaveProperty('disabled', true));
		// The refetch failed or hasn't landed: the same row must not unlock the controls.
		rerender(view({ ...before }));
		expect(screen.getByRole('button', { name: 'Pause' })).toHaveProperty('disabled', true);
		rerender(view({ ...before, updatedAt: '2026-11-04T20:00:05.000Z' }));
		expect(screen.getByRole('button', { name: 'Pause' })).toHaveProperty('disabled', false);
	});

	it('holds from the row on screen when the command is acknowledged, not the one it was clicked on', async () => {
		let acknowledge: (value: { data: object }) => void = () => undefined;
		mockedPost.mockReturnValue(new Promise((resolve) => (acknowledge = resolve)) as never);
		const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
		const view = (row: WorkflowDetail) => (
			<QueryClientProvider client={client}>
				<WorkflowCommands detail={row} />
			</QueryClientProvider>
		);
		const clicked = detail({ updatedAt: '2026-11-04T20:00:00.000Z' });
		const { rerender } = render(view(clicked));
		fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
		await waitFor(() => expect(mockedPost).toHaveBeenCalled());
		// A poll lands before the acknowledgement, still without the command.
		const polled = { ...clicked, updatedAt: '2026-11-04T20:00:02.000Z' };
		rerender(view(polled));
		acknowledge({ data: {} });
		await waitFor(() => expect(screen.getByRole('button', { name: 'Pause' })).toHaveProperty('disabled', true));
		rerender(view({ ...polled, updatedAt: '2026-11-04T20:00:05.000Z' }));
		expect(screen.getByRole('button', { name: 'Pause' })).toHaveProperty('disabled', false);
	});

	it('does not lock for good when the row carries no updatedAt', async () => {
		renderWithClient(<WorkflowCommands detail={detail()} />);
		fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
		await waitFor(() => expect(mockedPost).toHaveBeenCalled());
		await waitFor(() => expect(screen.getByRole('button', { name: 'Pause' })).toHaveProperty('disabled', false));
	});

	it('asks for a reason before abandoning instead of sending at once', () => {
		renderWithClient(<WorkflowCommands detail={detail()} />);
		fireEvent.click(screen.getByRole('button', { name: 'Abandon' }));
		expect(screen.getByRole('dialog')).toBeTruthy();
		expect(mockedPost).not.toHaveBeenCalled();
	});
});

describe('AbandonDialog', () => {
	beforeEach(() => {
		mockedPost.mockReset();
		mockedPost.mockResolvedValue({ data: {} });
	});
	afterEach(cleanup);

	it('will not abandon without a reason', () => {
		renderWithClient(<AbandonDialog workflowId="wf-1" onClose={() => undefined} />);
		const confirm = screen.getByRole('button', { name: 'Abandon' });
		expect(confirm).toHaveProperty('disabled', true);
		fireEvent.change(screen.getByLabelText('Reason'), { target: { value: '   ' } });
		expect(confirm).toHaveProperty('disabled', true);
	});

	it('holds the confirmation once another command is pending', () => {
		renderWithClient(<AbandonDialog workflowId="wf-1" held onClose={() => undefined} />);
		fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'host retired' } });
		expect(screen.getByRole('button', { name: 'Abandon' })).toHaveProperty('disabled', true);
	});

	it('sends the trimmed reason and closes', async () => {
		const onClose = vi.fn();
		renderWithClient(<AbandonDialog workflowId="wf-1" onClose={onClose} />);
		fireEvent.change(screen.getByLabelText('Reason'), { target: { value: '  host retired  ' } });
		fireEvent.click(screen.getByRole('button', { name: 'Abandon' }));
		await waitFor(() =>
			expect(mockedPost).toHaveBeenCalledWith('/Admin/Workflow/wf-1/abandon', { reason: 'host retired' })
		);
		await waitFor(() => expect(onClose).toHaveBeenCalled());
	});
});
