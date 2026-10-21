/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/config/apiClient', () => ({ apiClient: { get } }));

import { formatStaffUserLabel, StaffUserPicker } from './StaffUserPicker';

const self = { id: 'usr-me', email: 'me@harperdb.io', firstname: 'Me', lastname: 'Myself' };
const dawn = { id: 'usr-dawn', email: 'dawn@harperdb.io', firstname: 'Dawn', lastname: '' };
const rows = (...users: Array<typeof self>) => ({ data: users.map((user) => ({ ...user, status: 'ACTIVE' })) });
const searchedPrefixes = () => get.mock.calls.map(([url]) => /email=([^&*]*)\*/.exec(url as string)?.[1]);

function renderPicker(onChange = vi.fn(), value: typeof self | null = null) {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	render(
		<QueryClientProvider client={client}>
			<StaffUserPicker value={value} onChange={onChange} self={self} />
		</QueryClientProvider>,
	);
	return onChange;
}

beforeEach(() => {
	get.mockReset();
	vi.useFakeTimers();
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

async function typeAndSettle(text: string) {
	const input = screen.getByRole('combobox');
	fireEvent.focus(input);
	fireEvent.change(input, { target: { value: text } });
	await act(async () => {
		await vi.advanceTimersByTimeAsync(300);
	});
	await act(async () => {
		await vi.advanceTimersByTimeAsync(50);
	});
	return input;
}

describe('StaffUserPicker', () => {
	it('searches once the prefix is long enough and the typing has paused', async () => {
		get.mockResolvedValue(rows(dawn));
		renderPicker();

		await typeAndSettle('d');
		expect(get).not.toHaveBeenCalled();

		await typeAndSettle('da');
		expect(searchedPrefixes()).toEqual(['da']);
		expect(screen.getByRole('option', { name: 'dawn@harperdb.io (Dawn)' })).toBeDefined();
	});

	it('hands the picked match to the form and shows it in place of the search', async () => {
		get.mockResolvedValue(rows(dawn));
		const onChange = renderPicker();

		await typeAndSettle('da');
		fireEvent.click(screen.getByRole('option', { name: 'dawn@harperdb.io (Dawn)' }));

		expect(onChange).toHaveBeenCalledWith(dawn);
	});

	it('picks the highlighted match with Enter', async () => {
		get.mockResolvedValue(rows(self, dawn));
		const onChange = renderPicker();

		const input = await typeAndSettle('harper');
		fireEvent.keyDown(input, { key: 'ArrowDown' });
		fireEvent.keyDown(input, { key: 'Enter' });

		expect(onChange).toHaveBeenCalledWith(dawn);
	});

	// Until the typing settles again, the previous prefix's matches are neither shown nor pickable.
	it('shows no match for an edited prefix until the search settles', async () => {
		get.mockResolvedValue(rows(dawn));
		const onChange = renderPicker();

		const input = await typeAndSettle('da');
		expect(screen.getByRole('option', { name: 'dawn@harperdb.io (Dawn)' })).toBeDefined();

		fireEvent.change(input, { target: { value: 'me' } });
		expect(screen.queryByRole('option')).toBeNull();
		expect(screen.getByText('Searching…')).toBeDefined();
		fireEvent.keyDown(input, { key: 'Enter' });
		expect(onChange).not.toHaveBeenCalled();
	});

	it('never lets Enter reach the enclosing form', async () => {
		renderPicker();

		const input = await typeAndSettle('d');
		const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
		fireEvent(input, enter);

		expect(enter.defaultPrevented).toBe(true);
	});

	it('offers the signed-in account without a search', () => {
		const onChange = renderPicker();

		fireEvent.click(screen.getByRole('button', { name: 'Me' }));

		expect(onChange).toHaveBeenCalledWith(self);
		expect(get).not.toHaveBeenCalled();
	});

	it('shows a picked owner read-only, with a way back to the search', () => {
		const onChange = renderPicker(vi.fn(), self);

		expect((screen.getByDisplayValue('me@harperdb.io (Me Myself) — you') as HTMLInputElement).readOnly).toBe(true);
		fireEvent.click(screen.getByRole('button', { name: 'Change owner' }));

		expect(onChange).toHaveBeenCalledWith(null);
	});
});

describe('formatStaffUserLabel', () => {
	it('names the account and marks the caller', () => {
		expect(formatStaffUserLabel(dawn, self.id)).toBe('dawn@harperdb.io (Dawn)');
		expect(formatStaffUserLabel({ ...dawn, firstname: '' }, self.id)).toBe('dawn@harperdb.io');
		expect(formatStaffUserLabel(self, self.id)).toBe('me@harperdb.io (Me Myself) — you');
	});
});
