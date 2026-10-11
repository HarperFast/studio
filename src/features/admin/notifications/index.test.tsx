/**
 * @vitest-environment jsdom
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const createMutate = vi.fn();

vi.mock('@/features/notifications/hooks', () => ({
	useNotifications: () => ({ data: [], isLoading: false }),
}));
vi.mock('@/features/admin/notifications/mutations/useNotificationMutations', () => ({
	useCreateNotificationMutation: () => ({ mutate: createMutate, isPending: false }),
	useUpdateNotificationMutation: () => ({ mutate: vi.fn(), isPending: false }),
	useDeleteNotificationMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { NotificationsAdminIndex } from './index';

beforeAll(() => {
	// Radix Dialog relies on DOM APIs jsdom doesn't implement.
	Element.prototype.hasPointerCapture ??= () => false;
	Element.prototype.setPointerCapture ??= () => undefined;
	Element.prototype.releasePointerCapture ??= () => undefined;
	Element.prototype.scrollIntoView ??= () => undefined;
});

beforeEach(() => createMutate.mockReset());
afterEach(cleanup);

async function openCreateDialog() {
	render(<NotificationsAdminIndex />);
	await act(async () => {
		fireEvent.click(screen.getByRole('button', { name: 'New notification' }));
	});
	await act(async () => {
		fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Maintenance tonight' } });
	});
}

async function setWindow({ start, end }: { start?: string; end?: string }) {
	await act(async () => {
		if (start !== undefined) {
			fireEvent.change(screen.getByLabelText('Start (local time)'), { target: { value: start } });
		}
		if (end !== undefined) {
			fireEvent.change(screen.getByLabelText('End (local time)'), { target: { value: end } });
		}
	});
}

async function clickCreate() {
	await act(async () => {
		fireEvent.click(screen.getByRole('button', { name: 'Create' }));
	});
}

describe('NotificationsAdminIndex window inputs', () => {
	it('caps both inputs at a 4-digit year and floors them at 1970', async () => {
		await openCreateDialog();
		for (const label of ['Start (local time)', 'End (local time)']) {
			const input = screen.getByLabelText(label) as HTMLInputElement;
			expect(input.min).toBe('1970-01-01T00:00');
			expect(input.max).toBe('9999-12-31T23:59');
		}
	});

	it('refuses a 5-digit end year instead of saving a window that never ends', async () => {
		await openCreateDialog();
		await setWindow({ start: '2026-10-11T09:00', end: '20266-10-12T09:00' });
		await clickCreate();

		expect(screen.getByText('End time needs a valid date with a 4-digit year.')).toBeTruthy();
		expect(createMutate).not.toHaveBeenCalled();
	});

	it('refuses a 6-digit start year instead of saving a window that has always begun', async () => {
		await openCreateDialog();
		await setWindow({ start: '202666-10-11T09:00' });
		await clickCreate();

		expect(screen.getByText('Start time needs a valid date with a 4-digit year.')).toBeTruthy();
		expect(createMutate).not.toHaveBeenCalled();
	});

	it('refuses a half-typed end instead of reading its empty value as "no end"', async () => {
		await openCreateDialog();
		// What Chromium reports for a partly filled datetime-local, e.g. after the `max` cuts a fifth year digit off.
		Object.defineProperty(screen.getByLabelText('End (local time)'), 'validity', { value: { badInput: true } });
		await clickCreate();

		expect(screen.getByText('End time is incomplete. Finish the date and time, or clear it.')).toBeTruthy();
		expect(createMutate).not.toHaveBeenCalled();
	});

	it('clears the error once a corrected window is submitted', async () => {
		await openCreateDialog();
		await setWindow({ end: '20266-10-12T09:00' });
		await clickCreate();
		expect(screen.getByText('End time needs a valid date with a 4-digit year.')).toBeTruthy();

		await setWindow({ end: '2026-10-12T09:00' });
		await clickCreate();

		expect(screen.queryByText('End time needs a valid date with a 4-digit year.')).toBeNull();
		expect(createMutate).toHaveBeenCalledTimes(1);
	});

	it('saves a valid window as the UTC instants typed', async () => {
		await openCreateDialog();
		await setWindow({ start: '2026-10-11T09:00', end: '2026-10-12T09:00' });
		await clickCreate();

		expect(createMutate).toHaveBeenCalledTimes(1);
		expect(createMutate.mock.calls[0][0]).toMatchObject({
			message: 'Maintenance tonight',
			startAt: new Date(2026, 9, 11, 9, 0).toISOString(),
			endAt: new Date(2026, 9, 12, 9, 0).toISOString(),
		});
	});

	it('still saves an open-ended window when both inputs are empty', async () => {
		await openCreateDialog();
		await clickCreate();

		expect(createMutate).toHaveBeenCalledTimes(1);
		expect(createMutate.mock.calls[0][0]).toMatchObject({ startAt: null, endAt: null });
	});
});
