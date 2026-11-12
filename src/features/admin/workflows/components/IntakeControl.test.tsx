/**
 * @vitest-environment jsdom
 */
import { apiClient } from '@/config/apiClient';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IntakeControl } from './IntakeControl';

vi.mock('@/config/apiClient', () => ({ apiClient: { post: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }));
const auth = vi.hoisted(() => ({ canManage: true }));
vi.mock('@/hooks/useAuth', () => ({ useStaffPermission: () => auth.canManage }));
// Radix's portal listbox doesn't open reliably in jsdom; a native select keeps the same contract.
vi.mock('@/components/ui/select', () => ({
	Select: ({ value, disabled, onValueChange, children }: {
		value: string;
		disabled?: boolean;
		onValueChange: (value: string) => void;
		children: ReactNode;
	}) => (
		<select
			aria-label="Workflow intake"
			value={value}
			disabled={disabled}
			onChange={(event) => onValueChange(event.target.value)}
		>
			{children}
		</select>
	),
	SelectTrigger: () => null,
	SelectValue: () => null,
	SelectContent: ({ children }: { children: ReactNode }) => children,
	SelectItem: ({ value, children }: { value: string; children: ReactNode }) => (
		<option value={value}>{children}</option>
	),
}));
const mockedPost = vi.mocked(apiClient.post);

function renderIntake(mode: 'open' | 'queue' | 'pause' = 'open') {
	const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
	return render(
		<QueryClientProvider client={client}>
			<IntakeControl mode={mode} />
		</QueryClientProvider>,
	);
}

const choose = (mode: string) =>
	fireEvent.change(screen.getByLabelText('Workflow intake'), { target: { value: mode } });

describe('IntakeControl', () => {
	beforeEach(() => {
		auth.canManage = true;
		mockedPost.mockReset();
		mockedPost.mockResolvedValue({ data: {} });
	});
	afterEach(cleanup);

	it('says what the current mode does', () => {
		renderIntake('queue');
		expect(screen.getByText(/accepted but don’t start/)).toBeTruthy();
	});

	it('asks before switching, and sends nothing on cancel', () => {
		renderIntake('open');
		choose('pause');
		expect(screen.getByRole('dialog', { name: 'Set workflow intake to Pause?' })).toBeTruthy();
		expect(screen.getByText(/every running workflow stops at its next step boundary/)).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		expect(screen.queryByRole('dialog')).toBeNull();
		expect(mockedPost).not.toHaveBeenCalled();
	});

	it('sends the mode once confirmed', async () => {
		renderIntake('open');
		choose('queue');
		fireEvent.click(screen.getByRole('button', { name: 'Set to Queue' }));
		await waitFor(() => expect(mockedPost).toHaveBeenCalledWith('/Admin/Workflow/intake', { mode: 'queue' }));
		await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
	});

	it('keeps the dialog open when the switch fails', async () => {
		mockedPost.mockRejectedValue(new Error('nope'));
		renderIntake('open');
		choose('pause');
		fireEvent.click(screen.getByRole('button', { name: 'Set to Pause' }));
		await waitFor(() => expect(mockedPost).toHaveBeenCalled());
		expect(screen.getByRole('dialog')).toBeTruthy();
	});

	it('is read-only without workflow:manage', () => {
		auth.canManage = false;
		renderIntake('open');
		expect(screen.getByLabelText('Workflow intake')).toHaveProperty('disabled', true);
	});
});
