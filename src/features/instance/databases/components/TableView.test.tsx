/**
 * @vitest-environment jsdom
 */
import { ColumnDef } from '@/lib/table';
import { ColumnSizingState, ColumnVisibilityState } from '@tanstack/react-table';
import { cleanup, createEvent, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ColumnFiltersSchema } from './ColumnFilters';
import { TableView } from './TableView';

beforeAll(() => {
	Element.prototype.hasPointerCapture ??= () => false;
	Element.prototype.scrollIntoView ??= () => undefined;
	globalThis.ResizeObserver ??= class {
		observe() {}
		unobserve() {}
		disconnect() {}
	};
});

afterEach(() => cleanup());

const columns: ColumnDef<Record<string, unknown>>[] = [
	{ header: 'id', accessorKey: 'id' },
	{ header: 'type', accessorKey: 'type' },
];
// A stable reference so TanStack reuses the same row objects across re-renders —
// which is exactly the condition under which the cell memo used to go stale.
const data: Record<string, unknown>[] = [{ id: 'abc-123', type: 'demo' }];

function Harness(
	{ columnVisibility, resultSetKey = 'page-0', tableIdentity = 'dev.dog' }: {
		columnVisibility: ColumnVisibilityState;
		resultSetKey?: string;
		tableIdentity?: string;
	},
) {
	const columnFiltersForm = useForm<z.infer<typeof ColumnFiltersSchema>>({ defaultValues: {} });
	const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
	return (
		<TableView<Record<string, unknown>>
			applyFilters={() => undefined}
			columnFiltersForm={columnFiltersForm}
			columns={columns}
			columnVisibility={columnVisibility}
			columnSizing={columnSizing}
			setColumnSizing={setColumnSizing}
			data={data}
			pageIndex={0}
			pageSize={20}
			primaryKey="id"
			resultSetKey={resultSetKey}
			tableIdentity={tableIdentity}
			setPageIndex={() => undefined}
			setPageSize={() => undefined}
			filtersToggled={false}
			totalPages={1}
			totalRecords={1}
		/>
	);
}

describe('TableView column visibility', () => {
	it('drops a column from the body when it is hidden, not just from the header', () => {
		const { rerender } = render(<Harness columnVisibility={{}} />);
		// All columns visible: both values render in the body.
		expect(screen.getByText('abc-123')).toBeTruthy();
		expect(screen.getByText('demo')).toBeTruthy();

		// Hide the primary-key column.
		rerender(<Harness columnVisibility={{ id: false }} />);

		// The hidden column's cell must disappear from the body too (regression:
		// the body row used to keep rendering the stale cell, misaligning columns).
		expect(screen.queryByText('abc-123')).toBeNull();
		expect(screen.getByText('demo')).toBeTruthy();
	});
});

describe('TableView sorting', () => {
	const sortableColumns: ColumnDef<Record<string, unknown>>[] = [
		{ header: 'id', accessorKey: 'id', enableSorting: true },
	];
	const unsortedRows: Record<string, unknown>[] = [{ id: 'zeta' }, { id: 'alpha' }];

	function SortableHarness({ onColumnClick }: { onColumnClick: (accessorKey: string) => void }) {
		const columnFiltersForm = useForm<z.infer<typeof ColumnFiltersSchema>>({ defaultValues: {} });
		const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
		return (
			<TableView<Record<string, unknown>>
				applyFilters={() => undefined}
				columnFiltersForm={columnFiltersForm}
				columns={sortableColumns}
				columnVisibility={{}}
				columnSizing={columnSizing}
				setColumnSizing={setColumnSizing}
				data={unsortedRows}
				onColumnClick={onColumnClick}
				pageIndex={0}
				pageSize={20}
				primaryKey="id"
				resultSetKey="page-0"
				tableIdentity="dev.dog"
				setPageIndex={() => undefined}
				setPageSize={() => undefined}
				filtersToggled={false}
			/>
		);
	}

	it('reports the sort to the caller without reordering rows itself', () => {
		// The browse table is server-sorted: the click has to reach onColumnClick (which re-queries)
		// and the rows on screen must stay in the order the server returned them. TanStack v9 shares
		// one feature set across studio's tables, so this table opts out with `manualSorting: true` --
		// without it the registered sorted row model would reorder the current page behind the query.
		const sorts: string[] = [];
		render(<SortableHarness onColumnClick={(accessorKey) => sorts.push(accessorKey)} />);
		expect(Array.from(document.querySelectorAll('tbody td[data-col-id="id"]')).map((c) => c.textContent))
			.toEqual(['zeta', 'alpha']);

		fireEvent.click(screen.getByRole('button', { name: 'id' }));

		expect(sorts).toEqual(['id']);
		expect(Array.from(document.querySelectorAll('tbody td[data-col-id="id"]')).map((c) => c.textContent))
			.toEqual(['zeta', 'alpha']);
	});
});

// The last row has no value for the declared primary key -- the #1199 shape -- so it can't be
// named in a delete and must not be selectable.
const selectableRows: Record<string, unknown>[] = [
	{ id: 1, type: 'dog' },
	{ id: 2, type: 'cat' },
	{ type: 'orphan' },
];

function SelectionHarness(
	{ onRowClick, rows = selectableRows }: {
		onRowClick?: () => void;
		rows?: Record<string, unknown>[];
	} = {},
) {
	const columnFiltersForm = useForm<z.infer<typeof ColumnFiltersSchema>>({ defaultValues: {} });
	const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
	const [selectedKeys, setSelectedKeys] = useState<ReadonlySet<unknown>>(new Set());
	return (
		<TableView<Record<string, unknown>>
			applyFilters={() => undefined}
			columnFiltersForm={columnFiltersForm}
			columns={columns}
			columnVisibility={{}}
			columnSizing={columnSizing}
			setColumnSizing={setColumnSizing}
			data={rows}
			onRowClick={onRowClick}
			pageIndex={0}
			pageSize={20}
			primaryKey="id"
			resultSetKey="page-0"
			tableIdentity="dev.dog"
			rowSelection={{
				selectedKeys,
				toggleRow: (key) =>
					setSelectedKeys((current) => {
						const next = new Set(current);
						if (!next.delete(key)) {
							next.add(key);
						}
						return next;
					}),
				toggleAll: (keys, selectAll) => setSelectedKeys(selectAll ? new Set(keys) : new Set()),
				setRangeSelected: (keys, selected) =>
					setSelectedKeys((current) => {
						const next = new Set(current);
						for (const key of keys) {
							if (selected) {
								next.add(key);
							} else {
								next.delete(key);
							}
						}
						return next;
					}),
			}}
			setPageIndex={() => undefined}
			setPageSize={() => undefined}
			filtersToggled={false}
		/>
	);
}

function selectAllCheckbox() {
	return document.querySelector<HTMLInputElement>('thead input[type="checkbox"]')!;
}
function rowCheckboxes() {
	return Array.from(document.querySelectorAll<HTMLInputElement>('tbody input[type="checkbox"]'));
}

describe('TableView row selection', () => {
	it('renders no selection column when the caller supplies no rowSelection', () => {
		render(<Harness columnVisibility={{}} />);
		expect(document.querySelectorAll('input[type="checkbox"]').length).toBe(0);
	});

	it('selects and deselects every addressable row from the header checkbox', () => {
		render(<SelectionHarness />);
		// The keyless row gets a checkbox so the column stays aligned, but it can never be ticked.
		expect(rowCheckboxes().map((box) => box.disabled)).toEqual([false, false, true]);

		fireEvent.click(selectAllCheckbox());
		expect(rowCheckboxes().map((box) => box.checked)).toEqual([true, true, false]);
		// Every *selectable* row is selected, so the header reads as fully checked rather than partial.
		expect(selectAllCheckbox().checked).toBe(true);
		expect(selectAllCheckbox().indeterminate).toBe(false);

		fireEvent.click(selectAllCheckbox());
		expect(rowCheckboxes().map((box) => box.checked)).toEqual([false, false, false]);
	});

	it('shows the header checkbox as partially selected when only some rows are ticked', () => {
		render(<SelectionHarness />);

		fireEvent.click(rowCheckboxes()[0]);

		expect(selectAllCheckbox().checked).toBe(false);
		// `indeterminate` is a DOM property with no attribute behind it, so this is the regression
		// guard for it actually being assigned to the node.
		expect(selectAllCheckbox().indeterminate).toBe(true);
	});

	it('disables the header checkbox when no row on the page can be addressed', () => {
		render(<SelectionHarness rows={[{ type: 'orphan' }]} />);
		expect(selectAllCheckbox().disabled).toBe(true);
		expect(selectAllCheckbox().indeterminate).toBe(false);
	});

	it('draws the gutter divider as an inset shadow, never as a collapsed border', () => {
		// The table is `border-collapse: collapse`, where a cell's borders belong to the table's border
		// grid rather than the cell's own box — so a `border-r` here stays behind while the sticky cell
		// slides over it, and the scrolled rows show through the 1px seam it leaves. Pinned because the
		// obvious "cleanup" is to swap the shadow back for a border.
		render(<SelectionHarness />);
		const gutterCells = [
			document.querySelector('thead th')!,
			...Array.from(document.querySelectorAll('tbody tr > td:first-child')),
		];
		for (const cell of gutterCells) {
			expect(cell.className).toContain('shadow-[inset_-1px_0_0_var(--color-border)]');
			expect(cell.className).not.toMatch(/\bborder-[lr]\b/);
		}
	});

	it('will not select a row that only inherits its primary key from Object.prototype', () => {
		// `constructor` is a legal attribute name, and a row that doesn't carry it (the #1199 shape)
		// resolves to the inherited function on a plain property read: non-null, so the row looks
		// selectable, and the SAME reference for every such row — ticking one would tick them all.
		const columnsByCtor: ColumnDef<Record<string, unknown>>[] = [{ header: 'constructor', accessorKey: 'constructor' }];
		const rows: Record<string, unknown>[] = [{ constructor: 'real' }, { other: 'inherits-only' }];
		function CtorHarness() {
			const form = useForm<z.infer<typeof ColumnFiltersSchema>>({ defaultValues: {} });
			const [sizing, setSizing] = useState<ColumnSizingState>({});
			const [selectedKeys, setSelectedKeys] = useState<ReadonlySet<unknown>>(new Set());
			return (
				<TableView<Record<string, unknown>>
					applyFilters={() => undefined}
					columnFiltersForm={form}
					columns={columnsByCtor}
					columnVisibility={{}}
					columnSizing={sizing}
					setColumnSizing={setSizing}
					data={rows}
					pageIndex={0}
					pageSize={20}
					primaryKey="constructor"
					resultSetKey="page-0"
					tableIdentity="dev.dog"
					rowSelection={{
						selectedKeys,
						toggleRow: (key) => setSelectedKeys(new Set([key])),
						toggleAll: (keys, selectAll) => setSelectedKeys(selectAll ? new Set(keys) : new Set()),
						setRangeSelected: (keys, selected) =>
							setSelectedKeys((current) => {
								const next = new Set(current);
								for (const key of keys) {
									if (selected) {
										next.add(key);
									} else {
										next.delete(key);
									}
								}
								return next;
							}),
					}}
					setPageIndex={() => undefined}
					setPageSize={() => undefined}
					filtersToggled={false}
				/>
			);
		}
		render(<CtorHarness />);

		expect(rowCheckboxes().map((box) => box.disabled)).toEqual([false, true]);

		// Select-all must reach only the row that actually owns the attribute.
		fireEvent.click(selectAllCheckbox());
		expect(rowCheckboxes().map((box) => box.checked)).toEqual([true, false]);
	});

	it('ticks a row without opening the record editor', () => {
		// The row click opens the editor; the checkbox sits inside that click target, so without
		// stopping propagation every selection would also open a modal over the grid.
		let opened = 0;
		render(<SelectionHarness onRowClick={() => opened++} />);

		fireEvent.click(rowCheckboxes()[1]);

		expect(rowCheckboxes().map((box) => box.checked)).toEqual([false, true, false]);
		expect(opened).toBe(0);
	});

	it.each([
		['Control', { ctrlKey: true }],
		['Command', { metaKey: true }],
	])('%s-click toggles a row without opening the record editor', (_modifier, eventInit) => {
		let opened = 0;
		render(<SelectionHarness onRowClick={() => opened++} />);
		const firstRow = document.querySelector('tbody tr')!;

		fireEvent.click(firstRow, eventInit);
		expect(rowCheckboxes().map((box) => box.checked)).toEqual([true, false, false]);
		fireEvent.click(firstRow, eventInit);

		expect(rowCheckboxes().map((box) => box.checked)).toEqual([false, false, false]);
		expect(opened).toBe(0);
	});
});

describe('TableView shift-click range selection', () => {
	// Five rows, one of them unaddressable so a range has something to step over.
	const rangeRows: Record<string, unknown>[] = [
		{ id: 1 },
		{ id: 2 },
		{ orphan: true },
		{ id: 4 },
		{ id: 5 },
	];

	// Reported by row index: the keyless row has a checkbox but can never be checked.
	const checkboxes = rowCheckboxes;
	function checkedKeys() {
		return checkboxes().map((box) => box.checked);
	}

	function renderRange(onRowClick?: () => void) {
		return render(<SelectionHarness rows={rangeRows} onRowClick={onRowClick} />);
	}

	it('selects the inclusive range between the anchor and a shift-clicked row', () => {
		renderRange();
		fireEvent.click(checkboxes()[0]);
		expect(checkedKeys()).toEqual([true, false, false, false, false]);

		fireEvent.click(checkboxes()[3], { shiftKey: true });

		// Rows 0..3 inclusive, and the keyless row in between stays unselected because it has no
		// key to be selected by -- the range steps over it rather than stopping at it.
		expect(checkedKeys()).toEqual([true, true, false, true, false]);
	});

	it('extends upward as readily as downward', () => {
		renderRange();
		fireEvent.click(checkboxes()[4]);

		fireEvent.click(checkboxes()[1], { shiftKey: true });

		expect(checkedKeys()).toEqual([false, true, false, true, true]);
	});

	it('re-measures from the same anchor instead of ratcheting along', () => {
		// Shift-clicking a nearer row after a farther one must not leave the first range behind as
		// the anchor, or each shift-click would extend from wherever the last one landed.
		renderRange();
		fireEvent.click(checkboxes()[0]);
		fireEvent.click(checkboxes()[4], { shiftKey: true });
		expect(checkedKeys()).toEqual([true, true, false, true, true]);

		fireEvent.click(checkboxes()[1], { shiftKey: true });

		// Still measured from row 0. The range only adds, so rows 3 and 4 stay picked.
		expect(checkedKeys()).toEqual([true, true, false, true, true]);
	});

	it('falls back to a plain pick when there is no anchor yet', () => {
		renderRange();

		fireEvent.click(checkboxes()[2 + 1], { shiftKey: true });

		expect(checkedKeys()).toEqual([false, false, false, true, false]);
	});

	it('takes the anchor from the last pick made without shift', () => {
		renderRange();
		fireEvent.click(checkboxes()[0]);
		fireEvent.click(checkboxes()[1], { shiftKey: true });
		// A plain pick re-anchors, so the next shift measures from row 3, not row 0.
		fireEvent.click(checkboxes()[3]);
		expect(checkedKeys()).toEqual([true, true, false, true, false]);

		fireEvent.click(checkboxes()[4], { shiftKey: true });

		expect(checkedKeys()).toEqual([true, true, false, true, true]);
	});

	it('deselects the range when the anchoring click deselected its row', () => {
		// The range applies the anchor's state, so shift unticks exactly as readily as it ticks --
		// no second modifier, just whichever direction the plain click before it went.
		renderRange();
		fireEvent.click(checkboxes()[0]);
		fireEvent.click(checkboxes()[4], { shiftKey: true });
		expect(checkedKeys()).toEqual([true, true, false, true, true]);

		fireEvent.click(checkboxes()[1]);
		fireEvent.click(checkboxes()[4], { shiftKey: true });

		// Rows 1..4 cleared; row 0 is outside the range and keeps what it had.
		expect(checkedKeys()).toEqual([true, false, false, false, false]);
	});

	it('keeps a row unselected when a deselect range re-covers it', () => {
		// Mirror of the select-side case: the clicked box is already unchecked and the range only
		// clears, so its `checked` prop never changes -- where a natively-toggled checkbox would
		// desync from React's state.
		renderRange();
		fireEvent.click(checkboxes()[0]);
		fireEvent.click(checkboxes()[4], { shiftKey: true });
		fireEvent.click(checkboxes()[1]);
		fireEvent.click(checkboxes()[4], { shiftKey: true });

		fireEvent.click(checkboxes()[4], { shiftKey: true });

		expect(checkedKeys()).toEqual([true, false, false, false, false]);
	});

	it('deselects a range from the row as well as the checkbox', () => {
		let opened = 0;
		renderRange(() => opened++);
		fireEvent.click(checkboxes()[0]);
		fireEvent.click(checkboxes()[4], { shiftKey: true });
		fireEvent.click(checkboxes()[3]);

		fireEvent.click(document.querySelectorAll('tbody tr')[1], { shiftKey: true });

		expect(checkedKeys()).toEqual([true, false, false, false, true]);
		expect(opened).toBe(0);
	});

	it('extends from a shift-click on the row itself, not just the checkbox', () => {
		let opened = 0;
		renderRange(() => opened++);
		fireEvent.click(checkboxes()[0]);

		fireEvent.click(document.querySelectorAll('tbody tr')[3], { shiftKey: true });

		expect(checkedKeys()).toEqual([true, true, false, true, false]);
		expect(opened).toBe(0);
	});

	it('keeps a row selected when a range re-covers it', () => {
		// The clicked box is already checked and the range only adds, so its `checked` prop never
		// changes -- the case where a natively-toggled checkbox would desync from React's state.
		renderRange();
		fireEvent.click(checkboxes()[0]);
		fireEvent.click(checkboxes()[3], { shiftKey: true });

		fireEvent.click(checkboxes()[3], { shiftKey: true });

		expect(checkedKeys()).toEqual([true, true, false, true, false]);
	});

	it('does not drag a text selection across the rows a shift-click spans', () => {
		renderRange();
		const row = document.querySelectorAll('tbody tr')[2];

		const mouseDown = createEvent.mouseDown(row, { shiftKey: true, bubbles: true, cancelable: true });
		fireEvent(row, mouseDown);

		expect(mouseDown.defaultPrevented).toBe(true);
	});
});

describe('TableView column resizing', () => {
	it('renders a resize handle for each column header', () => {
		// Regression: the handle used to be gated on columnDef.enableResizing (never set), so it
		// never rendered. It is now gated on getCanResize(), driven by the table-level flag.
		const { container } = render(<Harness columnVisibility={{}} />);
		const handles = container.querySelectorAll('svg.lucide-grip-vertical');
		expect(handles.length).toBe(columns.length);
	});
});

describe('TableView scroll position', () => {
	function scroller(container: HTMLElement) {
		const element = container.querySelector<HTMLElement>('[data-slot="table-container"]');
		if (!element) {
			throw new Error('scroll container not found');
		}
		return element;
	}

	it('returns to the top of a new result set, keeping the sideways position', () => {
		// The scroller is the same DOM node across paging/sorting/filtering, so without an explicit
		// reset page 2 opens wherever page 1 was left. Sideways position survives: the columns are the
		// same ones, so the column the user scrolled out to is still the one they are reading.
		const { container, rerender } = render(<Harness columnVisibility={{}} resultSetKey="page-0" />);
		const element = scroller(container);
		element.scrollTop = 240;
		element.scrollLeft = 500;

		rerender(<Harness columnVisibility={{}} resultSetKey="page-1" />);

		expect(element.scrollTop).toBe(0);
		expect(element.scrollLeft).toBe(500);
	});

	it('returns to the top-left corner when the table itself changes', () => {
		// A different table means different columns, so the old sideways offset points at nothing.
		const { container, rerender } = render(
			<Harness columnVisibility={{}} resultSetKey="dog-page-0" tableIdentity="dev.dog" />,
		);
		const element = scroller(container);
		element.scrollTop = 240;
		element.scrollLeft = 500;

		rerender(<Harness columnVisibility={{}} resultSetKey="breed-page-0" tableIdentity="dev.breed" />);

		expect(element.scrollTop).toBe(0);
		expect(element.scrollLeft).toBe(0);
	});

	it('leaves the scroll position alone when the same rows re-render', () => {
		// A background refetch or a column-visibility toggle must not yank the user back to the top.
		const { container, rerender } = render(<Harness columnVisibility={{}} />);
		const element = scroller(container);
		element.scrollTop = 240;
		element.scrollLeft = 500;

		rerender(<Harness columnVisibility={{ type: false }} />);

		expect(element.scrollTop).toBe(240);
		expect(element.scrollLeft).toBe(500);
	});
});

function EmptyHarness(
	{ rows, emptyState, isFetching }: {
		rows?: Record<string, unknown>[];
		emptyState?: React.ReactNode;
		isFetching?: boolean;
	},
) {
	const columnFiltersForm = useForm<z.infer<typeof ColumnFiltersSchema>>({ defaultValues: {} });
	const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
	return (
		<TableView<Record<string, unknown>>
			applyFilters={() => undefined}
			columnFiltersForm={columnFiltersForm}
			columns={columns}
			columnVisibility={{}}
			columnSizing={columnSizing}
			setColumnSizing={setColumnSizing}
			data={rows}
			emptyState={emptyState}
			isFetching={isFetching}
			pageIndex={0}
			pageSize={20}
			primaryKey="id"
			resultSetKey="page-0"
			tableIdentity="dev.dog"
			setPageIndex={() => undefined}
			setPageSize={() => undefined}
			filtersToggled={false}
			totalPages={0}
			totalRecords={0}
		/>
	);
}

describe('TableView empty state', () => {
	it("renders the caller's empty state outside the table, not in a spanning cell", () => {
		render(<EmptyHarness rows={[]} emptyState={<p>Nothing here yet</p>} />);
		const empty = screen.getByText('Nothing here yet');
		expect(empty).toBeTruthy();
		// The table scrolls sideways and can be far wider than the viewport, so an empty state
		// centred inside it would sit off-screen past the last column.
		expect(empty.closest('table')).toBeNull();
		expect(screen.queryByText('No results.')).toBeNull();
	});

	it('keeps the plain "No results." cell when no empty state was given', () => {
		render(<EmptyHarness rows={[]} />);
		expect(screen.getByText('No results.')).toBeTruthy();
	});

	it('waits for the rows before claiming a table is empty', () => {
		const { rerender } = render(<EmptyHarness rows={undefined} emptyState={<p>Nothing here yet</p>} />);
		expect(screen.queryByText('Nothing here yet')).toBeNull();
		// Not even once a fetch settles into nothing arriving -- undefined is still "no answer yet".
		rerender(<EmptyHarness rows={undefined} isFetching={false} emptyState={<p>Nothing here yet</p>} />);
		expect(screen.queryByText('Nothing here yet')).toBeNull();

		rerender(<EmptyHarness rows={[]} emptyState={<p>Nothing here yet</p>} />);
		expect(screen.getByText('Nothing here yet')).toBeTruthy();
	});

	// Refreshing a settled empty table must not swap the panel back to the spinner cell and in again.
	it('keeps a settled empty panel in place while it refetches', () => {
		const { rerender } = render(<EmptyHarness rows={[]} emptyState={<p>Nothing here yet</p>} />);
		expect(screen.getByText('Nothing here yet')).toBeTruthy();

		rerender(<EmptyHarness rows={[]} isFetching emptyState={<p>Nothing here yet</p>} />);
		expect(screen.getByText('Nothing here yet')).toBeTruthy();
	});
});
