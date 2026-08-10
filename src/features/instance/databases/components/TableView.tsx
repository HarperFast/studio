'use client';

import { LoadingSubtle } from '@/components/LoadingSubtle';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableHeadSortable,
	TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/cn';
import { Cell, ColumnDef, Row, studioTableFeatures } from '@/lib/table';
import {
	ColumnSizingState,
	ColumnVisibilityState,
	flexRender,
	OnChangeFn,
	RowData,
	useTable,
} from '@tanstack/react-table';
import { Dispatch, SetStateAction, useMemo } from 'react';
import { UseFormReturn } from 'react-hook-form';
import { z } from 'zod';
import { ColumnFilters, ColumnFiltersSchema } from './ColumnFilters';
import { TablePagination } from './TablePagination';

interface BrowseDataTableProps<TData extends RowData> {
	applyFilters: () => void;
	columnFiltersForm: UseFormReturn<z.infer<typeof ColumnFiltersSchema>>;
	columns: ColumnDef<TData>[];
	columnVisibility: ColumnVisibilityState;
	columnSizing: ColumnSizingState;
	setColumnSizing: OnChangeFn<ColumnSizingState>;
	data?: TData[];
	isFetching?: boolean;
	onColumnClick?: (accessorKey: string, isDescending: boolean) => void;
	filtersToggled: boolean;
	onRowClick?: (row: Row<TData>) => void;
	pageIndex: number;
	pageSize: number;
	primaryKey: string;
	setPageIndex: Dispatch<SetStateAction<number>>;
	setPageSize: Dispatch<SetStateAction<number>>;
	totalPages?: number;
	totalRecords?: number;
	isEstimatedCount?: boolean;
	estimatedRange?: [number, number];
	isExactCountFetching?: boolean;
	isExactCountError?: boolean;
	onRequestExactCount?: () => void;
}

export function TableView<TData extends RowData>({
	applyFilters,
	columnFiltersForm,
	columns,
	columnVisibility,
	columnSizing,
	setColumnSizing,
	data,
	isFetching,
	onColumnClick,
	onRowClick,
	pageIndex,
	pageSize,
	primaryKey,
	setPageIndex,
	setPageSize,
	filtersToggled,
	totalPages,
	totalRecords,
	isEstimatedCount,
	estimatedRange,
	isExactCountFetching,
	isExactCountError,
	onRequestExactCount,
}: BrowseDataTableProps<TData>) {
	const table = useTable({
		features: studioTableFeatures,
		data: data || [],
		columns,
		// Rows arrive already paged and already sorted from the server, so the client-side row
		// models must not touch them. (v8 achieved this by simply not registering their row models;
		// v9 shares one feature set across studio's tables, so it is opted out per table instead.)
		manualSorting: true,
		enableColumnResizing: true,
		columnResizeMode: 'onEnd',
		onColumnSizingChange: setColumnSizing,
		defaultColumn: {
			// Wide enough that the header title + sort/resize controls never collide when shrinking.
			minSize: 80,
		},
		state: {
			columnVisibility,
			columnSizing,
		},
	});

	// During a column resize, preview where the new right edge will land with a full-height guide line.
	// columnResizeMode is 'onEnd', so the column width doesn't change until release -- the guide is the
	// live feedback. Its x is the sum of column widths up to the resizing one, plus the (clamped) drag delta.
	const columnResizing = table.state.columnResizing;
	const resizingColumnId = columnResizing.isResizingColumn;
	let resizeGuideLeft: number | null = null;
	if (resizingColumnId) {
		const minSize = table.options.defaultColumn?.minSize ?? 20;
		const startSize = table.getColumn(resizingColumnId)?.getSize() ?? 0;
		let edge = 0;
		for (const leafColumn of table.getVisibleLeafColumns()) {
			edge += leafColumn.getSize();
			if (leafColumn.id === resizingColumnId) {
				break;
			}
		}
		// Clamp to match the handle's own preview: the column can't shrink below minSize.
		resizeGuideLeft = edge + Math.max(columnResizing.deltaOffset ?? 0, minSize - startSize);
	}

	return (
		<>
			<div className="relative flex flex-col grow">
				<Table
					containerClassName="rounded-md bg-card dark:bg-black-dark grow overflow-visible"
					// table-fixed so columns hold their set/resized width exactly (content doesn't stretch
					// them); the trailing filler column below absorbs any leftover width so the rows still
					// reach the edge instead of leaving dead space.
					className="table-fixed"
				>
					<TableHeader>
						{table.getHeaderGroups().map((headerGroup) => (
							<TableRow key={headerGroup.id} className="border-none">
								{headerGroup.headers.map((header) => (
									<TableHeadSortable
										key={header.id}
										header={header}
										onColumnClick={onColumnClick}
										className="sticky top-32 z-10 bg-card dark:bg-black-dark border-b border-border"
									/>
								))}
								{/* Filler column: takes the remaining width so real columns stay tight. */}
								<TableHead
									aria-hidden
									className="w-full p-0 sticky top-32 z-10 bg-card dark:bg-black-dark border-b border-border"
								/>
							</TableRow>
						))}
					</TableHeader>
					{filtersToggled && (
						<ColumnFilters
							applyFilters={applyFilters}
							columnFiltersForm={columnFiltersForm}
							headerGroups={table.getHeaderGroups()}
						/>
					)}
					<TableBody className="bg-background dark:bg-black border border-border dark:border-grey-700">
						{table.getRowModel().rows?.length
							? (table.getRowModel().rows.map((row) => (
								<TableBodyRow
									key={row.id}
									row={row}
									onRowClick={onRowClick}
									primaryKey={primaryKey}
								/>
							)))
							: (
								<TableRow>
									<TableCell colSpan={columns.length + 1} className="h-24 text-center">
										{isFetching || data === undefined
											? <LoadingSubtle className="opacity-50 inline-block" />
											: <span>No results.</span>}
									</TableCell>
								</TableRow>
							)}
					</TableBody>
				</Table>
				{resizeGuideLeft !== null && (
					<div
						aria-hidden
						className="pointer-events-none absolute top-0 bottom-0 z-20 w-0.5 bg-primary"
						style={{ left: `${resizeGuideLeft}px` }}
					/>
				)}
			</div>
			<TablePagination
				pageIndex={pageIndex}
				pageSize={pageSize}
				totalPages={totalPages}
				totalRecords={totalRecords}
				isEstimatedCount={isEstimatedCount}
				estimatedRange={estimatedRange}
				isExactCountFetching={isExactCountFetching}
				isExactCountError={isExactCountError}
				onRequestExactCount={onRequestExactCount}
				setPageIndex={setPageIndex}
				setPageSize={setPageSize}
			/>
		</>
	);
}

function TableBodyRow<TData extends RowData>(
	{ row, primaryKey, onRowClick }: { row: Row<TData>; primaryKey?: string; onRowClick?: (row: Row<TData>) => void },
) {
	// TanStack memoizes getVisibleCells() and returns a fresh array whenever the
	// visible columns change, so depending on it keeps the body in step with the
	// header (a hidden column must leave the body too, not just the header).
	const visibleCells = row.getVisibleCells();
	const cells = useMemo(() => {
		const original = row.original as Record<string, unknown>;
		const isExpired = original && original.message === 'This entry has expired';

		if (isExpired) {
			if (visibleCells[0]?.column?.id === primaryKey) {
				return [
					<TableBodyRowCell key={visibleCells[0].id} cell={visibleCells[0]} />,
					<TableBodyRowExpiredSpan key="expired" colSpan={visibleCells.length - 1} />,
				];
			}
			return [
				<TableBodyRowExpiredSpan key="expired" colSpan={visibleCells.length} />,
			];
		}
		return visibleCells.map((cell) => <TableBodyRowCell key={cell.id} cell={cell} />);
	}, [row, primaryKey, visibleCells]);

	return (
		<TableRow
			data-state={row.getIsSelected() && 'selected'}
			onClick={() => onRowClick?.(row)}
			className={cn('hover:bg-muted/10 data-[state=selected]:bg-muted', onRowClick && 'cursor-pointer')}
		>
			{cells}
			{/* Filler cell matching the header's filler column. */}
			<TableCell aria-hidden className="p-0" />
		</TableRow>
	);
}

function TableBodyRowCell<TData extends RowData>({ cell }: { cell: Cell<TData> }) {
	const size = cell.column.getSize();
	return (
		<TableCell
			data-col-id={cell.column.id}
			// maxWidth pins the cell to the (resizable) column width so wider values truncate instead
			// of forcing the column open; width keeps narrow columns from collapsing below it.
			style={{ width: `${size}px`, maxWidth: `${size}px` }}
			className="px-2 py-2 overflow-hidden text-ellipsis whitespace-nowrap"
		>
			{/* Object/array stringification lives in the column defs (renderPlainCell / RelationshipCell). */}
			{flexRender(cell.column.columnDef.cell, cell.getContext())}
		</TableCell>
	);
}

function TableBodyRowExpiredSpan({ colSpan }: { colSpan: number }) {
	return (
		<TableCell
			colSpan={colSpan}
			className="px-2 py-2 overflow-x-hidden max-w-32 text-ellipsis whitespace-nowrap"
		>
			<span className="text-muted-foreground">This entry has expired</span>
		</TableCell>
	);
}
