/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { TablePagination } from './TablePagination';

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
