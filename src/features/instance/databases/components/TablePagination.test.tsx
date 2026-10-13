/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { TablePagination, uncountedTotal } from './TablePagination';

// Radix's tooltip relies on a handful of DOM APIs that jsdom doesn't implement.
beforeAll(() => {
	Element.prototype.hasPointerCapture ??= () => false;
	Element.prototype.setPointerCapture ??= () => undefined;
	Element.prototype.releasePointerCapture ??= () => undefined;
	Element.prototype.scrollIntoView ??= () => undefined;
	if (typeof window.PointerEvent === 'undefined') {
		window.PointerEvent = class extends MouseEvent {} as typeof PointerEvent;
	}
});

afterEach(() => cleanup());

const baseProps = {
	pageIndex: 0,
	pageSize: 20,
	setPageIndex: () => {},
	setPageSize: () => {},
};

// When open, Radix Tooltip renders its content twice (the visible popper plus a visually-hidden copy for
// screen readers), so the action button appears more than once -- both are real renders of the same
// element and share the onClick handler. Use the *All* queries and act on the first match.
describe('TablePagination record count', () => {
	it('renders an exact count plainly (no estimate affordance)', () => {
		render(<TablePagination {...baseProps} totalPages={5} totalRecords={87} />);

		expect(screen.getByText('87 records')).toBeTruthy();
		// No "~" prefix and no exact-count action when the count is already exact.
		expect(screen.queryByRole('button', { name: /get exact count/i })).toBeNull();
		expect(screen.queryByText(/~/)).toBeNull();
	});

	it('marks an estimated count with "~" and offers an on-demand exact count', () => {
		const onRequestExactCount = vi.fn();
		render(
			<TablePagination
				{...baseProps}
				totalPages={50}
				totalRecords={1000}
				isEstimatedCount
				estimatedRange={[900, 1100]}
				onRequestExactCount={onRequestExactCount}
			/>,
		);

		const trigger = screen.getByRole('button', { name: /approximately 1,000 records \(estimated\)/i });
		expect(trigger.textContent).toContain('~1,000 records');

		// Radix opens the tooltip on focus (delayDuration is 0), surfacing the range + action.
		fireEvent.focus(trigger);
		expect(screen.getAllByText(/Likely between 900 and 1,100/i).length).toBeGreaterThan(0);

		fireEvent.click(screen.getAllByRole('button', { name: /get exact count/i })[0]);
		expect(onRequestExactCount).toHaveBeenCalledTimes(1);
	});

	it('shows a disabled loading label while the exact count is being computed', () => {
		render(
			<TablePagination
				{...baseProps}
				totalPages={50}
				totalRecords={1000}
				isEstimatedCount
				estimatedRange={[900, 1100]}
				isExactCountFetching
			/>,
		);

		fireEvent.focus(screen.getByRole('button', { name: /approximately 1,000 records/i }));
		const action = screen.getAllByRole('button', { name: /counting/i })[0];
		expect(action.hasAttribute('disabled')).toBe(true);
	});

	it('surfaces an error and offers a retry when the exact count fails', () => {
		const onRequestExactCount = vi.fn();
		render(
			<TablePagination
				{...baseProps}
				totalPages={50}
				totalRecords={1000}
				isEstimatedCount
				estimatedRange={[900, 1100]}
				isExactCountError
				onRequestExactCount={onRequestExactCount}
			/>,
		);

		fireEvent.focus(screen.getByRole('button', { name: /approximately 1,000 records/i }));
		expect(screen.getAllByText(/couldn.t get the exact count/i).length).toBeGreaterThan(0);

		// The action becomes a retry that re-invokes the fetch.
		fireEvent.click(screen.getAllByRole('button', { name: /try again/i })[0]);
		expect(onRequestExactCount).toHaveBeenCalledTimes(1);
	});
});

// A filtered search reports no count, and the whole table's describes a different result set (#1253).
describe('TablePagination on an uncounted result set', () => {
	const pageText = () => screen.getByText(/^Page \d/).textContent;
	const nextButton = () => screen.getByRole('button', { name: 'Next page' }) as HTMLButtonElement;

	it("ignores the whole table's count and offers nothing past a page that ends the matches", () => {
		render(
			<TablePagination
				{...baseProps}
				totalPages={50}
				totalRecords={1000}
				uncountedPage={{ rowCount: 7, hasNextPage: false }}
			/>,
		);

		expect(screen.getByText('7 matching records')).toBeTruthy();
		expect(screen.queryByText(/1,000/)).toBeNull();
		expect(pageText()).toBe('Page 1 of 1');
		expect(nextButton().disabled).toBe(true);
	});

	it('pages forward without claiming a page count while more matches follow', () => {
		const setPageIndex = vi.fn();
		render(
			<TablePagination
				{...baseProps}
				pageIndex={1}
				setPageIndex={setPageIndex}
				uncountedPage={{ rowCount: 20, hasNextPage: true }}
			/>,
		);

		expect(screen.getByText('More than 40 matching records')).toBeTruthy();
		expect(pageText()).toBe('Page 2');
		// Only the pages known to exist are numbered; the ellipsis says more may follow.
		expect(screen.getAllByRole('button', { name: /^Page \d/ }).map((button) => button.textContent)).toEqual([
			'1',
			'2',
			'3',
		]);
		expect(screen.getByText('…')).toBeTruthy();

		fireEvent.click(nextButton());
		expect(setPageIndex).toHaveBeenCalledWith(2);
	});

	it('counts the matches exactly on a full last page', () => {
		render(<TablePagination {...baseProps} pageIndex={2} uncountedPage={{ rowCount: 20, hasNextPage: false }} />);

		expect(screen.getByText('60 matching records')).toBeTruthy();
		expect(pageText()).toBe('Page 3 of 3');
		expect(nextButton().disabled).toBe(true);
	});

	it('waits for the page before saying anything about its size', () => {
		render(<TablePagination {...baseProps} totalPages={50} totalRecords={1000} uncountedPage={{}} />);

		expect(pageText()).toBe('Page 1 of …');
		expect(screen.queryByText(/records/)).toBeNull();
		expect(nextButton().disabled).toBe(true);
	});

	it('does not count an empty page past the first as the end of the matches', () => {
		// Only reachable when matches vanish between pages: the result set ends somewhere before here.
		render(<TablePagination {...baseProps} pageIndex={3} uncountedPage={{ rowCount: 0, hasNextPage: false }} />);

		expect(screen.getByText('No matching records on this page')).toBeTruthy();
		expect(pageText()).toBe('Page 4');
		expect(nextButton().disabled).toBe(true);
	});
});

describe('uncountedTotal', () => {
	it('is exact only once the page that ends the result set is on screen', () => {
		expect(uncountedTotal(0, 20, { rowCount: 0, hasNextPage: false })).toBe(0);
		expect(uncountedTotal(0, 20, { rowCount: 1, hasNextPage: false })).toBe(1);
		expect(uncountedTotal(2, 20, { rowCount: 5, hasNextPage: false })).toBe(45);
		expect(uncountedTotal(2, 20, { rowCount: 20, hasNextPage: true })).toBeUndefined();
		expect(uncountedTotal(2, 20, { rowCount: 0, hasNextPage: false })).toBeUndefined();
		expect(uncountedTotal(0, 20, {})).toBeUndefined();
	});
});
