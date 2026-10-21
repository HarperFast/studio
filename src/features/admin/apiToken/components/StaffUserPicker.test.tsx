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

	it('never lets Enter reach the enclosing form, even after Escape closed the list', async () => {
		renderPicker();
		const input = await typeAndSettle('d');
		fireEvent.keyDown(input, { key: 'Escape' });

		const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
		fireEvent(input, enter);

		expect(enter.defaultPrevented).toBe(true);
	});

	it('does not search once the picker has lost focus', async () => {
		renderPicker();
		const input = screen.getByRole('combobox');
		fireEvent.focus(input);
		fireEvent.change(input, { target: { value: 'da' } });
		fireEvent.blur(input);

		await act(async () => {
			await vi.advanceTimersByTimeAsync(400);
		});

		expect(get).not.toHaveBeenCalled();
	});

	it('says to type more when the search ran out of pages before the table', async () => {
		const customers = (page: number) =>
			Array.from({ length: 100 }, (_, i) => ({ ...dawn, id: `c${page}-${i}`, email: `da${page}${i}@example.com` }));
		get
			.mockResolvedValueOnce(rows(...customers(0).slice(1), { ...dawn, id: 'usr-dan', email: 'dan@harperdb.io' }))
			.mockResolvedValueOnce(rows(...customers(1)))
			.mockResolvedValueOnce(rows(...customers(2)))
			.mockResolvedValueOnce(rows(...customers(3)))
			.mockResolvedValueOnce(rows(...customers(4)));
		renderPicker();

		await typeAndSettle('da');

		expect(screen.getByRole('option', { name: /dan@harperdb.io/ })).toBeDefined();
		expect(screen.getByText(/type more of the address/)).toBeDefined();
	});

	it('cancels a search in flight when the picker closes', async () => {
		let resolvePage!: (value: unknown) => void;
		get.mockImplementationOnce(
			(_url: string, { signal }: { signal: AbortSignal }) =>
				new Promise((resolve, reject) => {
					resolvePage = resolve;
					signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
				}),
		);
		renderPicker();
		const input = screen.getByRole('combobox');
		fireEvent.focus(input);
		fireEvent.change(input, { target: { value: 'da' } });
		await act(async () => {
			await vi.advanceTimersByTimeAsync(300);
		});
		const signal = get.mock.calls[0][1].signal as AbortSignal;
		expect(signal.aborted).toBe(false);

		fireEvent.keyDown(input, { key: 'Escape' });
		await act(async () => {
			await vi.advanceTimersByTimeAsync(50);
		});

		expect(signal.aborted).toBe(true);
		resolvePage(rows());
	});

	it('passes the query signal down so later pages stop when the picker moves on', async () => {
		get.mockResolvedValue(rows(dawn));
		renderPicker();

		await typeAndSettle('da');

		expect(get.mock.calls[0][1]).toEqual({ signal: expect.any(AbortSignal) });
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
