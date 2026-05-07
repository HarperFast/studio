'use client';

import { LoadingSubtle } from '@/components/LoadingSubtle';
import { TextLoadingSkeleton } from '@/components/TextLoadingSkeleton';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHeader, TableHeadSortable, TableRow } from '@/components/ui/table';
import { addCommasToNumbers } from '@/lib/addCommasToNumbers';
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
import { ArrowLeftIcon, ArrowRightIcon } from 'lucide-react';
import { Dispatch, SetStateAction, useCallback, useMemo } from 'react';
import { UseFormReturn } from 'react-hook-form';
import { z } from 'zod';
import { ColumnFilters, ColumnFiltersSchema } from './ColumnFilters';

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

	const previousPage = useCallback(() => {
		setPageIndex(pageIndex - 1);
	}, [pageIndex, setPageIndex]);
	const nextPage = useCallback(() => {
		setPageIndex(pageIndex + 1);
	}, [pageIndex, setPageIndex]);

	return (
		<>
			<Table containerClassName="rounded-md bg-black-dark grow max-h-[calc(100vh-128px-16px-112px-80px)]">
				<TableHeader>
					{table.getHeaderGroups().map((headerGroup) => (
						<TableRow key={headerGroup.id} className="border-none">
							{headerGroup.headers.map((header) => (
								<TableHeadSortable key={header.id} header={header} onColumnClick={onColumnClick} />
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
				<TableBody className="bg-black border border-grey-700">
					{table.getRowModel().rows?.length
						? (table.getRowModel().rows.map((row) => (
							<TableBodyRow key={row.id} row={row} onRowClick={onRowClick} primaryKey={primaryKey} />
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
			<div className="flex items-center justify-end py-4 space-x-2 pr-4">
				<Button
					variant="defaultOutline"
					size="sm"
					onClick={previousPage}
					className="select-none"
					disabled={pageIndex === 0}
				>
					<ArrowLeftIcon />
					Previous
				</Button>

				<div className="grow"></div>

				<div className="text-center">
					<dt className="font-medium text-gray-500 text-sm/6 dark:text-gray-400">Records</dt>
					<dd className="font-semibold tracking-tight">
						{totalRecords === undefined
							? <TextLoadingSkeleton />
							: addCommasToNumbers(totalRecords)}
					</dd>
				</div>
				{totalRecords !== undefined && totalRecords > 0 && (
					<>
						<div>
							<Select
								defaultValue={pageSize.toString()}
								onValueChange={(value) => {
									setPageSize(Number(value));
								}}
							>
								<SelectTrigger className="h-10 w-20">
									<SelectValue />
								</SelectTrigger>
								<SelectContent side="top">
									{[20, 50, 100, 250].map((pageSize) => (
										<SelectItem key={pageSize} value={`${pageSize}`}>
											{pageSize}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						{totalPages !== undefined && totalPages > 1 && (
							<>
								<div className="text-center">
									<dt className="font-medium text-gray-500 text-sm/6 dark:text-gray-400">Pages</dt>
									<dd className="font-semibold tracking-tight">{addCommasToNumbers(totalPages)}</dd>
								</div>
								<div className="text-center">
									<dt className="font-medium text-gray-500 text-sm/6 dark:text-gray-400">Page</dt>
									<dd className="font-semibold tracking-tight">{addCommasToNumbers(pageIndex + 1)}</dd>
								</div>
							</>
						)}
					</>
				)}

				<div className="grow"></div>

				<Button
					variant="defaultOutline"
					size="sm"
					onClick={nextPage}
					className="select-none"
					disabled={totalPages === undefined || pageIndex === totalPages - 1}
				>
					Next
					<ArrowRightIcon />
				</Button>
			</div>
		</>
	);
}

function TableBodyRow<TData>(
	{ row, primaryKey, onRowClick }: { row: Row<TData>; primaryKey?: string; onRowClick?: (row: Row<TData>) => void },
) {
	const cells = useMemo(() => {
		const original = row.original as Record<string, unknown>;
		const isExpired = original && original.message === 'This entry has expired';
		const visibleCells = row.getVisibleCells();

		console.log('primaryKey, visibleCells', primaryKey, visibleCells);

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
	}, [row, primaryKey]);

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
