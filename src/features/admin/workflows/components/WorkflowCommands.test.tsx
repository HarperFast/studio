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
		renderWithClient(<WorkflowCommands detail={detail({ acceptedCommands: [...accepted] })} readAt={0} />);
		expect(buttonNames()).toEqual(buttons);
	});

	it('renders no commands for an account without workflow:manage', () => {
		auth.canManage = false;
		renderWithClient(<WorkflowCommands detail={detail()} readAt={0} />);
		expect(buttonNames()).toEqual([]);
	});

	it('sends a command to the workflow’s path', async () => {
		renderWithClient(<WorkflowCommands detail={detail()} readAt={0} />);
		fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
		await waitFor(() => expect(mockedPost).toHaveBeenCalledWith('/Admin/Workflow/wf-1/pause', {}));
	});

	it('holds every command while one is already pending', () => {
		renderWithClient(
			<WorkflowCommands detail={detail({ command: { action: 'pause', by: 'ops@example.com' } })} readAt={0} />,
		);
		for (const button of screen.getAllByRole('button')) { expect(button).toHaveProperty('disabled', true); }
	});

	describe('after a command is acknowledged', () => {
		const ackAt = 5_000;
		let now: ReturnType<typeof vi.spyOn>;
		beforeEach(() => {
			now = vi.spyOn(Date, 'now').mockReturnValue(ackAt);
		});
		afterEach(() => now.mockRestore());

		async function sendPause(row: WorkflowDetail, readAt: number) {
			const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
			const view = (next: WorkflowDetail, at: number) => (
				<QueryClientProvider client={client}>
					<WorkflowCommands detail={next} readAt={at} />
				</QueryClientProvider>
			);
			const { rerender } = render(view(row, readAt));
			fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
			await waitFor(() => expect(mockedPost).toHaveBeenCalled());
			return (next: WorkflowDetail, at: number) => rerender(view(next, at));
		}

		it('holds until data received after the acknowledgement, whatever the row shows', async () => {
			const row = detail({ updatedAt: '2026-11-04T20:00:00.000Z' });
			const show = await sendPause(row, 1_000);
			await waitFor(() => expect(screen.getByRole('button', { name: 'Pause' })).toHaveProperty('disabled', true));
			// A poll that left before the command and rendered late carries a newer row but an older read.
			show({ ...row, updatedAt: '2026-11-04T20:00:02.000Z' }, 4_000);
			expect(screen.getByRole('button', { name: 'Pause' })).toHaveProperty('disabled', true);
			show({ ...row, updatedAt: '2026-11-04T20:00:02.000Z' }, 6_000);
			expect(screen.getByRole('button', { name: 'Pause' })).toHaveProperty('disabled', false);
		});

		it('releases for a row the command already changed before it was acknowledged', async () => {
			const show = await sendPause(detail(), 1_000);
			const paused = detail({ status: 'PAUSED', acceptedCommands: ['resume', 'undo', 'abandon'] });
			show(paused, 4_000);
			expect(screen.getByRole('button', { name: 'Resume' })).toHaveProperty('disabled', true);
			show(paused, 6_000);
			expect(screen.getByRole('button', { name: 'Resume' })).toHaveProperty('disabled', false);
		});
	});

	it('asks for a reason before abandoning instead of sending at once', () => {
		renderWithClient(<WorkflowCommands detail={detail()} readAt={0} />);
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
