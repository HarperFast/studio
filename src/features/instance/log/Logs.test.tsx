/** @vitest-environment jsdom */
import { LogContextLimitError, ReadLogItem } from '@/integrations/api/instance/status/getReadLog';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UseInstanceLogsParams } from './hooks/useInstanceLogs';
import { LogsExplorer } from './index';
import { buildLogLink } from './logView';

const state = vi.hoisted(() => ({
	logs: [] as ReadLogItem[],
	version: '5.4.0',
	args: {} as UseInstanceLogsParams,
	refetch: vi.fn(),
	copy: vi.fn(),
	error: null as unknown,
	loading: false,
}));
vi.mock('./hooks/useInstanceLogs', () => ({
	useInstanceLogs: (args: UseInstanceLogsParams) => {
		state.args = args;
		return {
			logs: state.logs,
			isLoading: state.loading,
			isFetching: false,
			refetch: state.refetch,
			transport: 'polling',
			error: state.error,
		};
	},
}));
vi.mock(
	'@tanstack/react-query',
	async (importOriginal) => ({
		...(await importOriginal<typeof import('@tanstack/react-query')>()),
		useQuery: () => ({ data: { version: state.version } }),
	}),
);
vi.mock('@/hooks/useCopyToClipboard', () => ({ useCopyTextToClipboard: () => state.copy }));
const log = (message: string, node = 'node-a', second = 1): ReadLogItem => ({
	level: 'error',
	timestamp: `2026-11-19T21:00:0${second}.123Z`,
	node,
	thread: 'http/2',
	tags: ['test'],
	message,
});
const params = { entityId: 'cluster-a', entityType: 'cluster', instanceClient: {} } as Parameters<
	typeof LogsExplorer
>[0]['params'];
beforeAll(() => {
	Element.prototype.scrollTo = vi.fn();
	Element.prototype.scrollIntoView = vi.fn();
	Element.prototype.hasPointerCapture ??= () => false;
	Element.prototype.setPointerCapture ??= () => undefined;
	Element.prototype.releasePointerCapture ??= () => undefined;
	window.PointerEvent ??= class extends MouseEvent {} as typeof PointerEvent;
});
beforeEach(() => {
	state.logs = [log('first error'), log('second error', 'node-b', 2)];
	state.version = '5.4.0';
	state.error = null;
	state.loading = false;
	state.copy.mockClear();
	state.refetch.mockClear();
	localStorage.clear();
});
afterEach(cleanup);

describe('logs explorer interactions', () => {
	it('preserves exact JSON tokens and safely renders a sparse log without a message', () => {
		state.logs = [log('{"id":9007199254740993,"duration":1.0000000000000001}'), {
			...log(''),
			message: undefined as unknown as string,
		}];
		render(<LogsExplorer params={params} />);
		fireEvent.click(screen.getByRole('button', { name: 'Expand log 1' }));
		expect(screen.getByLabelText('Full log message').textContent).toBe(state.logs[0].message);
		fireEvent.click(screen.getByRole('button', { name: 'Expand log 2' }));
		expect(screen.getAllByLabelText('Full log message')[1].textContent).toBe('');
	});

	it('expands multiple logs inline, copies without collapsing, and reveals full metadata', () => {
		render(<LogsExplorer params={params} />);
		fireEvent.click(screen.getByRole('button', { name: 'Expand log 1' }));
		fireEvent.click(screen.getByRole('button', { name: 'Expand log 2' }));
		expect(screen.getAllByLabelText('Full log message')).toHaveLength(2);
		expect(document.querySelector('time')!.textContent).toMatch(/\d{2}:\d{2}:\d{2}/);
		fireEvent.click(screen.getAllByRole('button', { name: 'Copy message' })[0]);
		expect(state.copy).toHaveBeenCalledWith('first error');
		fireEvent.click(screen.getAllByRole('button', { name: 'Copy JSON' })[0]);
		expect(JSON.parse(state.copy.mock.lastCall![0])).toEqual(state.logs[0]);
		expect(screen.getAllByLabelText('Full log message')).toHaveLength(2);
		fireEvent.click(screen.getByRole('button', { name: 'Collapse log 1' }));
		expect(screen.getAllByLabelText('Full log message')).toHaveLength(1);
	});
	for (const reversed of [false, true]) {
		it(`holds expanded rows through live arrivals and resumes explicitly (reversed=${reversed})`, () => {
			localStorage.setItem('LogsOrderReversed', JSON.stringify(reversed));
			const { rerender } = render(<LogsExplorer params={params} />);
			fireEvent.click(screen.getByRole('switch', { name: 'Live logs' }));
			fireEvent.click(screen.getByRole('button', { name: 'Expand log 1' }));
			const inspected = screen.getByLabelText('Full log message').textContent;
			state.logs = [log('new arrival', 'node-c', 3), ...state.logs];
			rerender(<LogsExplorer params={params} />);
			expect(screen.queryByText('new arrival')).toBeNull();
			expect(screen.getByLabelText('Full log message').textContent).toBe(inspected);
			fireEvent.click(screen.getByRole('button', { name: /1 new matching logs available.*Resume live/ }));
			expect(screen.getByText('new arrival')).toBeTruthy();
		});
	}
	it('pins inspection even with Live off through a focus-style refetch and preserves expansion on Refresh', () => {
		const { rerender } = render(<LogsExplorer params={params} />);
		fireEvent.click(screen.getByRole('button', { name: 'Expand log 1' }));
		fireEvent.click(screen.getByRole('button', { name: 'Refresh logs' }));
		expect(screen.getByLabelText('Full log message').textContent).toBe('first error');
		fireEvent.click(screen.getByRole('button', { name: 'Collapse log 1' }));
		fireEvent.click(screen.getByRole('button', { name: 'Expand log 1' }));
		state.logs = [log('focus refetch arrival')];
		rerender(<LogsExplorer params={params} />);
		expect(screen.getByLabelText('Full log message').textContent).toBe('first error');
		expect(screen.queryByText('focus refetch arrival')).toBeNull();
		fireEvent.click(screen.getByRole('button', { name: 'Refresh logs' }));
		expect(screen.getByText('focus refetch arrival')).toBeTruthy();
	});

	it('ignores inspection gestures until the current query loads', () => {
		state.loading = true;
		state.logs = [];
		const { container, rerender } = render(<LogsExplorer params={params} />);
		fireEvent.wheel(container.querySelector('[data-slot="table-container"]')!);
		state.loading = false;
		state.logs = [log('loaded after wheel')];
		rerender(<LogsExplorer params={params} />);
		expect(screen.getByText('loaded after wheel')).toBeTruthy();
		expect(screen.queryByText(/Paused for inspection/)).toBeNull();
	});
	it('pins a scrollbar drag before a live flush can interrupt it', () => {
		const { container, rerender } = render(<LogsExplorer params={params} />);
		fireEvent.click(screen.getByRole('switch', { name: 'Live logs' }));
		const scroller = container.querySelector('[data-slot="table-container"]')!;
		fireEvent.pointerDown(scroller);
		state.logs = [log('mid-drag arrival'), ...state.logs];
		rerender(<LogsExplorer params={params} />);
		Object.defineProperty(scroller, 'scrollTop', { value: 120, configurable: true });
		fireEvent.scroll(scroller);
		expect(screen.queryByText('mid-drag arrival')).toBeNull();
		expect(screen.getByRole('button', { name: /Resume live/ })).toBeTruthy();
	});
	it('reveals invalid hidden date drafts when submitting Search', async () => {
		render(<LogsExplorer params={params} />);
		fireEvent.change(screen.getByLabelText('Time range'), { target: { value: 'custom' } });
		fireEvent.change(screen.getByLabelText('Start date (local time)'), { target: { value: '2099-01-01T12:00' } });
		fireEvent.click(screen.getAllByRole('button', { name: 'Filters' })[0]);
		expect(screen.queryByLabelText('Start date (local time)')).toBeNull();
		fireEvent.submit(screen.getByRole('searchbox', { name: 'Search logs' }).closest('form')!);
		expect(await screen.findByText('Date cannot be after today')).toBeTruthy();
		expect(screen.getByLabelText('Start date (local time)')).toBeTruthy();
	});
	it('retains canonical UTC bounds when untouched context dates are applied', async () => {
		state.logs = [{ ...log('DST second hour'), timestamp: '2026-11-01T06:30:00Z' }];
		const link = buildLogLink('https://studio.example/#/org/clu/logs', state.logs[0], 'hdb.log');
		render(<LogsExplorer params={params} search={new URL(link).hash.split('?')[1]} />);
		const previous = state.args.logFilters;
		fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
		fireEvent.click(screen.getByRole('button', { name: 'Apply Filters' }));
		await waitFor(() => expect(state.args.logFilters).not.toBe(previous));
		expect(state.args.logFilters.from).toBe(previous.from);
		expect(state.args.logFilters.until).toBe(previous.until);
	});

	for (const changed of ['from', 'until'] as const) {
		it(`preserves the untouched canonical DST bound when only ${changed} changes`, async () => {
			state.logs = [{ ...log('DST partial edit'), timestamp: '2026-11-01T06:30:00Z' }];
			const link = buildLogLink('https://studio.example/#/org/clu/logs', state.logs[0], 'hdb.log');
			render(<LogsExplorer params={params} search={new URL(link).hash.split('?')[1]} />);
			const previous = state.args.logFilters;
			fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
			fireEvent.change(
				screen.getByLabelText(changed === 'from' ? 'Start date (local time)' : 'End date (local time)'),
				{ target: { value: changed === 'from' ? '2026-11-01T00:00' : '2026-11-01T03:00' } },
			);
			fireEvent.click(screen.getByRole('button', { name: 'Apply Filters' }));
			await waitFor(() => expect(state.args.logFilters).not.toBe(previous));
			const untouched = changed === 'from' ? 'until' : 'from';
			expect(state.args.logFilters[untouched]).toBe(previous[untouched]);
		});
	}
	it('freezes when a user scrolls away from the newest edge', () => {
		const { container, rerender } = render(<LogsExplorer params={params} />);
		fireEvent.click(screen.getByRole('switch', { name: 'Live logs' }));
		const scroller = container.querySelector('[data-slot="table-container"]')!;
		Object.defineProperty(scroller, 'scrollTop', { value: 10, configurable: true });
		fireEvent.wheel(scroller);
		fireEvent.scroll(scroller);
		Object.defineProperty(scroller, 'scrollTop', { value: 120, configurable: true });
		fireEvent.scroll(scroller);
		state.logs = [log('new arrival'), ...state.logs];
		rerender(<LogsExplorer params={params} />);
		expect(screen.queryByText('new arrival')).toBeNull();
		expect(screen.getByRole('button', { name: /Resume live/ })).toBeTruthy();
	});
	it('restores all expanded logs when returning from surrounding context', () => {
		const { rerender } = render(<LogsExplorer params={params} />);
		fireEvent.click(screen.getByRole('button', { name: 'Expand log 1' }));
		fireEvent.click(screen.getByRole('button', { name: 'Expand log 2' }));
		fireEvent.click(screen.getAllByRole('button', { name: 'View surrounding logs' })[0]);
		expect(state.args.logFilters).toMatchObject({ level: 'undefined', filter: '', limit: '1000' });
		expect(Date.parse(state.args.logFilters.until!) - Date.parse(state.args.logFilters.from!)).toBe(60000);
		expect(state.args.live).toBe(false);
		expect(screen.getByRole('switch', { name: 'Live logs' }).hasAttribute('disabled')).toBe(true);
		state.logs = [log('nearby event')];
		rerender(<LogsExplorer params={params} />);
		fireEvent.click(screen.getByRole('button', { name: 'Back to previous view' }));
		expect(screen.getAllByText('first error').length).toBeGreaterThan(0);
		expect(screen.getAllByText('second error').length).toBeGreaterThan(0);
		expect(screen.queryByText('nearby event')).toBeNull();
		expect(screen.getAllByLabelText('Full log message')).toHaveLength(2);
	});
	it('validates persisted column preferences while keeping required columns visible', () => {
		localStorage.setItem('LogsColumnSizing', JSON.stringify({ message: 'bad', timestamp: -5, node: 180 }));
		localStorage.setItem(
			'LogsColumnVisibility',
			JSON.stringify({ tags: true, message: false, timestamp: false, level: 'bad' }),
		);
		render(<LogsExplorer params={params} />);
		expect(screen.getByRole('columnheader', { name: 'Message' })).toBeTruthy();
		expect(screen.getByRole('columnheader', { name: 'Timestamp' })).toBeTruthy();
		expect(screen.getByRole('columnheader', { name: 'Tags' })).toBeTruthy();
	});

	it('keeps mandatory columns, allows tags to be revealed, and spans only visible columns', () => {
		const { container } = render(<LogsExplorer params={params} />);
		fireEvent.pointerDown(screen.getByRole('button', { name: 'Columns' }), { button: 0, ctrlKey: false });
		expect(screen.queryByRole('menuitemcheckbox', { name: 'Message' })).toBeNull();
		expect(screen.queryByRole('menuitemcheckbox', { name: 'Timestamp' })).toBeNull();
		fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Tags' }));
		expect(screen.getByRole('menuitemcheckbox', { name: 'Tags' }).getAttribute('aria-checked')).toBe('true');
		fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
		fireEvent.click(screen.getByRole('button', { name: 'Expand log 1' }));
		expect(container.querySelector('td[colspan]')?.getAttribute('colspan')).toBe('7');
	});
	it('opens a copied deep link on its selected event and ignores malformed targets', async () => {
		const link = buildLogLink('https://studio.example/#/org/clu/logs', state.logs[0], 'hdb.log');
		const { unmount } = render(<LogsExplorer params={params} search={new URL(link).hash.split('?')[1]} />);
		await waitFor(() => expect(screen.getByLabelText('Full log message').textContent).toBe('first error'));
		unmount();
		render(<LogsExplorer params={params} search="?log=bad" />);
		expect(screen.queryByLabelText('Full log message')).toBeNull();
	});
	it('keeps a linked row collapsed when the loaded rows change', () => {
		const link = buildLogLink('https://studio.example/#/org/clu/logs', state.logs[0], 'hdb.log');
		const { rerender } = render(<LogsExplorer params={params} search={new URL(link).hash.split('?')[1]} />);
		fireEvent.click(screen.getByRole('button', { name: 'Collapse log 1' }));
		state.logs = [...state.logs, log('another row', 'node-a', 3)];
		rerender(<LogsExplorer params={params} search={new URL(link).hash.split('?')[1]} />);
		expect(screen.queryByLabelText('Full log message')).toBeNull();
	});

	it('refreshes the applied query without submitting the search draft', () => {
		render(<LogsExplorer params={params} />);
		const search = screen.getByRole('searchbox', { name: 'Search logs' });
		fireEvent.change(search, { target: { value: 'unsubmitted draft' } });
		fireEvent.click(screen.getByRole('button', { name: 'Refresh logs' }));
		expect(state.args.logFilters.filter).toBe('');
		expect((search as HTMLInputElement).value).toBe('unsubmitted draft');
	});

	it('respects source/search compatibility gates and shows retry on read failure', () => {
		state.version = '4.7.0';
		state.error = new Error('read failed');
		render(<LogsExplorer params={params} />);
		expect(screen.queryByRole('searchbox', { name: 'Search logs' })).toBeNull();
		fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
		expect(screen.queryByText('Log file')).toBeNull();
		expect(screen.getByRole('alert').textContent).toContain('Could not load logs');
	});
	it('applies custom dates, stops live for a fixed end time, and lets Latest clear bounds', async () => {
		render(<LogsExplorer params={params} />);
		fireEvent.click(screen.getByRole('switch', { name: 'Live logs' }));
		fireEvent.change(screen.getByLabelText('Time range'), { target: { value: 'custom' } });
		fireEvent.change(screen.getByLabelText('Start date (local time)'), { target: { value: '2026-11-19T12:00' } });
		fireEvent.change(screen.getByLabelText('End date (local time)'), { target: { value: '2026-11-19T13:00' } });
		fireEvent.click(screen.getByRole('button', { name: 'Apply Filters' }));
		await waitFor(() => expect(state.args.logFilters.until).toBe('2026-11-19T13:00'));
		expect(state.args.live).toBe(false);
		expect(screen.getByText('Filter loaded results')).toBeTruthy();
		fireEvent.change(screen.getByLabelText('Time range'), { target: { value: 'latest' } });
		expect(state.args.logFilters).toMatchObject({ from: '', until: '' });
	});
});

it('explains an oversized context and opens filters for recovery', () => {
	state.error = new LogContextLimitError();
	render(<LogsExplorer params={params} />);
	expect(screen.getByRole('alert').textContent).toContain('Too many logs');
	fireEvent.click(screen.getByRole('button', { name: 'Open context filters' }));
	expect(screen.getByLabelText('Start date (local time)')).toBeTruthy();
});

it('keeps generated future context bounds valid across a midnight clock skew', async () => {
	const event = new Date();
	event.setDate(event.getDate() + 1);
	event.setHours(0, 1, 0, 0);
	state.logs = [{ ...log('server clock ahead'), timestamp: event.toISOString() }];
	const link = buildLogLink('https://studio.example/#/org/clu/logs', state.logs[0], 'hdb.log');
	render(<LogsExplorer params={params} search={new URL(link).hash.split('?')[1]} />);
	const previous = state.args.logFilters;
	fireEvent.click(screen.getByRole('button', { name: 'Search' }));
	await waitFor(() => expect(state.args.logFilters).not.toBe(previous));
	expect(state.args.logFilters.from).toBe(previous.from);
	expect(state.args.logFilters.until).toBe(previous.until);
	expect(screen.queryByRole('alert')).toBeNull();
});
it('does not pin an empty slice after an initial failed load', () => {
	state.logs = [];
	state.error = new Error('temporary failure');
	const { container, rerender } = render(<LogsExplorer params={params} />);
	fireEvent.wheel(container.querySelector('[data-slot="table-container"]')!);
	state.error = null;
	state.logs = [log('retry succeeded')];
	rerender(<LogsExplorer params={params} />);
	expect(screen.getByText('retry succeeded')).toBeTruthy();
	expect(screen.queryByText(/Paused for inspection/)).toBeNull();
});

it('Search promotes custom date drafts instead of discarding them under a relative preset', async () => {
	render(<LogsExplorer params={params} />);
	fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
	fireEvent.change(screen.getByLabelText('Start date (local time)'), { target: { value: '2026-11-18T00:00' } });
	fireEvent.click(screen.getByRole('button', { name: 'Search' }));
	await waitFor(() => expect(state.args.logFilters.relative_minutes).toBeUndefined());
	expect(state.args.logFilters.from).toBe('2026-11-18T00:00');
	expect((screen.getByLabelText('Time range') as HTMLSelectElement).value).toBe('custom');
});
it('does not hide arrivals after a gesture over a successfully empty view', () => {
	state.logs = [];
	const { container, rerender } = render(<LogsExplorer params={params} />);
	fireEvent.wheel(container.querySelector('[data-slot="table-container"]')!);
	state.logs = [log('first arrival')];
	rerender(<LogsExplorer params={params} />);
	expect(screen.getByText('first arrival')).toBeTruthy();
	expect(screen.queryByText(/Paused for inspection/)).toBeNull();
});

for (const reversed of [false, true]) {
	it(`walks expanded logs with arrow keys in visible order (reversed=${reversed})`, () => {
		state.logs = [log('first'), log('second', 'node-a', 2), log('third', 'node-a', 3)];
		localStorage.setItem('LogsOrderReversed', JSON.stringify(reversed));
		render(<LogsExplorer params={params} />);
		fireEvent.click(screen.getByRole('button', { name: 'Expand log 1' }));
		const original = screen.getByLabelText('Full log message').textContent;
		fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' });
		expect(screen.getByLabelText('Full log message').textContent).toBe(original);
		fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
		expect(screen.getByLabelText('Full log message').textContent).toBe('second');
		expect(screen.queryByRole('button', { name: 'Collapse log 1' })).toBeNull();
		expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Collapse log 2' }));
		fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
		fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
		expect(screen.getByLabelText('Full log message').textContent).toBe(reversed ? 'first' : 'third');
		expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Collapse log 3' }));
		fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' });
		expect(screen.getByLabelText('Full log message').textContent).toBe('second');
	});
}

it('navigates the filtered slice and keeps independently expanded logs open', () => {
	state.logs = [log('first'), log('excluded', 'node-b', 2), log('third', 'node-a', 3), log('fourth', 'node-a', 4)];
	render(<LogsExplorer params={params} />);
	fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
	fireEvent.change(screen.getByLabelText('Node'), { target: { value: 'node-a' } });
	fireEvent.click(screen.getByRole('button', { name: 'Expand log 1' }));
	fireEvent.click(screen.getByRole('button', { name: 'Expand log 3' }));
	screen.getByRole('button', { name: 'Collapse log 1' }).focus();
	fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
	expect(screen.getAllByLabelText('Full log message').map(el => el.textContent)).toEqual(['third', 'fourth']);
	const copy = screen.getAllByRole('button', { name: 'Copy JSON' })[0];
	copy.focus();
	fireEvent.keyDown(copy, { key: 'ArrowUp' });
	expect(screen.getAllByLabelText('Full log message').map(el => el.textContent)).toEqual(['first', 'fourth']);
});

it('preserves modified arrow keys and native search/menu keyboard behavior', () => {
	render(<LogsExplorer params={params} />);
	fireEvent.click(screen.getByRole('button', { name: 'Expand log 1' }));
	fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown', shiftKey: true });
	expect(screen.getByLabelText('Full log message').textContent).toBe('first error');
	const search = screen.getByRole('searchbox');
	search.focus();
	fireEvent.keyDown(search, { key: 'ArrowDown' });
	expect(document.activeElement).toBe(search);
	expect(screen.getByLabelText('Full log message').textContent).toBe('first error');
	fireEvent.pointerDown(screen.getByRole('button', { name: 'Columns' }), { button: 0, ctrlKey: false });
	fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowDown' });
	expect(screen.getByLabelText('Full log message').textContent).toBe('first error');
});
