'use client';

import { LoadingSubtle } from '@/components/LoadingSubtle';
import { Table, TableBody, TableCell, TableHeader, TableHeadSortable, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/cn';
import {
	Cell,
	ColumnDef,
	flexRender,
	getCoreRowModel,
	getPaginationRowModel,
	Row,
	useReactTable,
	VisibilityState,
} from '@tanstack/react-table';
import { Dispatch, SetStateAction, useMemo } from 'react';
import { UseFormReturn } from 'react-hook-form';
import { z } from 'zod';
import { ColumnFilters, ColumnFiltersSchema } from './ColumnFilters';
import { TablePagination } from './TablePagination';

interface BrowseDataTableProps<TData, TValue> {
	applyFilters: () => void;
	columnFiltersForm: UseFormReturn<z.infer<typeof ColumnFiltersSchema>>;
	columns: ColumnDef<TData, TValue>[];
	columnVisibility: VisibilityState;
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
}

export function TableView<TData, TValue>({
	applyFilters,
	columnFiltersForm,
	columns,
	columnVisibility,
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
}: BrowseDataTableProps<TData, TValue>) {
	const table = useReactTable({
		data: data || [],
		columns,
		manualPagination: true,
		enableColumnResizing: true,
		columnResizeMode: 'onEnd',
		pageCount: totalPages,
		defaultColumn: {
			minSize: 1,
		},
		state: {
			columnVisibility,
		},
		rowCount: totalRecords,
		getCoreRowModel: getCoreRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
	});

	return (
		<>
			<Table containerClassName="rounded-md bg-card dark:bg-black-dark grow overflow-visible">
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
								<TableCell colSpan={columns.length} className="h-24 text-center">
									{isFetching || data === undefined
										? <LoadingSubtle className="opacity-50 inline-block" />
										: <span>No results.</span>}
								</TableCell>
							</TableRow>
						)}
				</TableBody>
			</Table>
			<TablePagination
				pageIndex={pageIndex}
				pageSize={pageSize}
				totalPages={totalPages}
				totalRecords={totalRecords}
				setPageIndex={setPageIndex}
				setPageSize={setPageSize}
			/>
		</>
	);
}

function TableBodyRow<TData>(
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
		</TableRow>
	);
}

function TableBodyRowCell<TData>({ cell }: { cell: Cell<TData, unknown> }) {
	return (
		<TableCell
			style={{ width: `${cell.column.getSize()}px` }}
			className="px-2 py-2 overflow-x-hidden max-w-32 text-ellipsis whitespace-nowrap"
		>
			{cell.getValue() == '[object Object]'
				? JSON.stringify(cell.getValue())
				: flexRender(cell.column.columnDef.cell, cell.getContext())}
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
