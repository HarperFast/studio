/**
 * TanStack Table v9 no longer bundles every feature into every table: each one has to be registered
 * up front, and the resulting feature set becomes the first generic parameter of every table type
 * (`ColumnDef<TFeatures, TData, TValue>`, `Row<TFeatures, TData>`, ...).
 *
 * Studio registers a single feature set here and re-exports the table types already bound to it, so
 * call sites keep writing `ColumnDef<SchemaUser>` and only the registration below decides which
 * features exist. Import table types from this module rather than from `@tanstack/react-table`.
 *
 * Row models are part of the feature set, so they are shared too. A table that must not sort on the
 * client opts out per table with `manualSorting: true` (the browse table sorts on the server).
 */
import {
	Cell as TanStackCell,
	CellContext as TanStackCellContext,
	ColumnDef as TanStackColumnDef,
	columnFilteringFeature,
	columnResizingFeature,
	columnSizingFeature,
	columnVisibilityFeature,
	createColumnHelper as createTanStackColumnHelper,
	createSortedRowModel,
	Header as TanStackHeader,
	HeaderGroup as TanStackHeaderGroup,
	Row as TanStackRow,
	RowData,
	rowSelectionFeature,
	rowSortingFeature,
	sortFns,
	Table as TanStackTable,
	tableFeatures,
} from '@tanstack/react-table';

export const studioTableFeatures = tableFeatures({
	// Column widths, plus the drag-to-resize interaction the browse table's headers wire up.
	columnSizingFeature,
	columnResizingFeature,
	// The browse table hides columns via the "Columns" dropdown.
	columnVisibilityFeature,
	// Only for `columnDef.enableColumnFilter`, which marks the browse table's filterable columns.
	// No filtered row model is registered: filtering runs on the server.
	columnFilteringFeature,
	// `row.getIsSelected()` drives the selected-row styling shared by every table.
	rowSelectionFeature,
	rowSortingFeature,
	sortedRowModel: createSortedRowModel(),
	// The built-in sort functions, so a column that doesn't name a `sortFn` still gets the
	// auto-detected one it had in v8.
	sortFns,
});

export type StudioTableFeatures = typeof studioTableFeatures;

export type Cell<TData extends RowData, TValue = unknown> = TanStackCell<StudioTableFeatures, TData, TValue>;
export type CellContext<TData extends RowData, TValue = unknown> = TanStackCellContext<
	StudioTableFeatures,
	TData,
	TValue
>;
export type ColumnDef<TData extends RowData, TValue = unknown> = TanStackColumnDef<
	StudioTableFeatures,
	TData,
	TValue
>;
export type Header<TData extends RowData, TValue = unknown> = TanStackHeader<StudioTableFeatures, TData, TValue>;
export type HeaderGroup<TData extends RowData> = TanStackHeaderGroup<StudioTableFeatures, TData>;
export type Row<TData extends RowData> = TanStackRow<StudioTableFeatures, TData>;
export type Table<TData extends RowData> = TanStackTable<StudioTableFeatures, TData>;

/** `createColumnHelper` with studio's feature set already applied. */
export function createColumnHelper<TData extends RowData>() {
	return createTanStackColumnHelper<StudioTableFeatures, TData>();
}
