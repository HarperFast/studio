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
 * client opts out per table with `manualSorting: true` (the browse table sorts on the server). The
 * filtered and paginated row models are the exception: see `studioClientTableFeatures`.
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
	createFilteredRowModel,
	createPaginatedRowModel,
	createSortedRowModel,
	globalFilteringFeature,
	Header as TanStackHeader,
	HeaderGroup as TanStackHeaderGroup,
	Row as TanStackRow,
	RowData,
	rowPaginationFeature,
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
	// No filtered row model is registered here: filtering runs on the server.
	columnFilteringFeature,
	// `SimpleBrowseDataTable`'s search box and pager. Only their APIs and state are shared; their row
	// models are in `studioClientTableFeatures`.
	globalFilteringFeature,
	rowPaginationFeature,
	// `row.getIsSelected()` drives the selected-row styling shared by every table.
	rowSelectionFeature,
	rowSortingFeature,
	sortedRowModel: createSortedRowModel(),
	// The built-in sort functions, so a column that doesn't name a `sortFn` still gets the
	// auto-detected one it had in v8.
	sortFns,
});

export type StudioTableFeatures = typeof studioTableFeatures;

/**
 * The shared set plus the client-side filtered and paginated row models, for a table that holds its
 * whole data set (`SimpleBrowseDataTable`). Not in the shared set because the paginated row model's
 * default state is a 10-row page: registered there, it would truncate every table that didn't opt out,
 * the browse and logs tables included. Typed as the shared set because row-model slots carry no types
 * and TanStack's table types are invariant in the feature set.
 */
const clientRowModels = {
	filteredRowModel: createFilteredRowModel(),
	paginatedRowModel: createPaginatedRowModel(),
};
export const studioClientTableFeatures: StudioTableFeatures = { ...studioTableFeatures, ...clientRowModels };

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
