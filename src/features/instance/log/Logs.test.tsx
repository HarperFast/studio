/** @vitest-environment jsdom */
import { ReadLogItem } from '@/integrations/api/instance/status/getReadLog';
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
}));
vi.mock('./hooks/useInstanceLogs', () => ({
	useInstanceLogs: (args: UseInstanceLogsParams) => {
		state.args = args;
		return {
			logs: state.logs,
			isLoading: false,
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
	state.copy.mockClear();
	state.refetch.mockClear();
	localStorage.clear();
});
afterEach(cleanup);

describe('logs explorer interactions', () => {
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
			fireEvent.click(screen.getByRole('button', { name: /1 new logs available.*Resume live/ }));
			expect(screen.getByText('new arrival')).toBeTruthy();
		});
	}
	it('freezes when a user scrolls away from the newest edge', () => {
		const { container, rerender } = render(<LogsExplorer params={params} />);
		fireEvent.click(screen.getByRole('switch', { name: 'Live logs' }));
		const scroller = container.querySelector('[data-slot="table-container"]')!;
		Object.defineProperty(scroller, 'scrollTop', { value: 120, configurable: true });
		fireEvent.wheel(scroller);
		fireEvent.scroll(scroller);
		state.logs = [log('new arrival'), ...state.logs];
		rerender(<LogsExplorer params={params} />);
		expect(screen.queryByText('new arrival')).toBeNull();
		expect(screen.getByRole('button', { name: /Resume live/ })).toBeTruthy();
	});
	it('pivots to bounded context and restores the original pinned slice', () => {
		const { rerender } = render(<LogsExplorer params={params} />);
		fireEvent.click(screen.getByRole('button', { name: 'Expand log 1' }));
		fireEvent.click(screen.getByRole('button', { name: 'View surrounding logs' }));
		expect(state.args.logFilters).toMatchObject({ level: 'undefined', filter: '', limit: '1000' });
		expect(Date.parse(state.args.logFilters.until!) - Date.parse(state.args.logFilters.from!)).toBe(60000);
		expect(state.args.live).toBe(false);
		expect(screen.getByRole('switch', { name: 'Live logs' }).hasAttribute('disabled')).toBe(true);
		state.logs = [log('nearby event')];
		rerender(<LogsExplorer params={params} />);
		fireEvent.click(screen.getByRole('button', { name: 'Back to previous view' }));
		expect(screen.getAllByText('first error').length).toBeGreaterThan(0);
		expect(screen.getByText('second error')).toBeTruthy();
		expect(screen.queryByText('nearby event')).toBeNull();
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
