/**
 * @vitest-environment jsdom
 */
import { ColumnDef, ColumnSizingState, VisibilityState } from '@tanstack/react-table';
import { cleanup, render, screen } from '@testing-library/react';
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

function Harness({ columnVisibility }: { columnVisibility: VisibilityState }) {
	const columnFiltersForm = useForm<z.infer<typeof ColumnFiltersSchema>>({ defaultValues: {} });
	const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
	return (
		<TableView<Record<string, unknown>, unknown>
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

describe('TableView column resizing', () => {
	it('renders a resize handle for each column header', () => {
		// Regression: the handle used to be gated on columnDef.enableResizing (never set), so it
		// never rendered. It is now gated on getCanResize(), driven by the table-level flag.
		const { container } = render(<Harness columnVisibility={{}} />);
		const handles = container.querySelectorAll('svg.lucide-grip-vertical');
		expect(handles.length).toBe(columns.length);
	});
});
