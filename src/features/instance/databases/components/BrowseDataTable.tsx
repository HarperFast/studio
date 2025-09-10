'use client';

import { Loading } from '@/components/Loading';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHeader, TableHeadSortable, TableRow } from '@/components/ui/table';
import { addCommasToNumbers } from '@/lib/addCommasToNumbers';
import { cn } from '@/lib/cn';
import {
	ColumnDef,
	flexRender,
	getCoreRowModel,
	getPaginationRowModel,
	PaginationState,
	Row,
	SortingState,
	useReactTable,
} from '@tanstack/react-table';
import { ArrowLeftIcon, ArrowRightIcon } from 'lucide-react';
import React, { Dispatch, SetStateAction } from 'react';

interface BrowseDataTableProps<TData, TValue> {
	columns: ColumnDef<TData, TValue>[];
	data: TData[];
	isFetching?: boolean;
	totalPages: number;
	totalRecords: number;
	onRowClick?: (row: Row<TData>) => void;
	onColumnClick?: (accessorKey: string, isDescending: boolean) => void;
	paginationState: {
		pageIndex: number; pageSize: number;
	};
	sortingState: SortingState;
	setPagination: Dispatch<SetStateAction<PaginationState>>;
	children: React.ReactNode;
}

export function BrowseDataTable<TData, TValue>({
	columns,
	data,
	isFetching,
	totalPages,
	totalRecords,
	onRowClick,
	onColumnClick,
	paginationState,
	sortingState,
	setPagination,
	children,
}: BrowseDataTableProps<TData, TValue>) {
	const table = useReactTable({
		data,
		columns,
		manualPagination: true,
		pageCount: totalPages,
		rowCount: totalRecords,
		getCoreRowModel: getCoreRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
		initialState: {
			pagination: paginationState, sorting: sortingState,
		},
		onPaginationChange: setPagination,
	});

	return (<>
		{children}
		<Table containerClassName="rounded-md bg-black-dark grow max-h-[calc(100vh-128px-16px-112px-80px)]">
			<TableHeader>
				{table.getHeaderGroups().map((headerGroup) => (<TableRow key={headerGroup.id} className="border-none">
					{headerGroup.headers.map((header) =>
						<TableHeadSortable key={header.id} header={header} onColumnClick={onColumnClick} />)}
				</TableRow>))}
			</TableHeader>
			<TableBody className="bg-black border border-grey-700">
				{table.getRowModel().rows?.length ? (table.getRowModel().rows.map((row) => (
					<TableRow key={row.id} data-state={row.getIsSelected() && 'selected'}
						onClick={() => onRowClick?.(row)}
						className={cn('hover:bg-muted/10 data-[state=selected]:bg-muted', onRowClick && 'cursor-pointer')}>
						{row.getVisibleCells().map((cell) => (<TableCell key={cell.id}
							className="py-2 px-2 overflow-x-hidden max-w-32 text-ellipsis whitespace-nowrap">
							{flexRender(cell.column.columnDef.cell, cell.getContext())}
						</TableCell>))}
					</TableRow>))) : (<TableRow>
					<TableCell colSpan={columns.length} className="h-24 text-center">
						{isFetching ? <div><Loading className="m-12" /></div> : <span>No results.</span>}
					</TableCell>
				</TableRow>)}
			</TableBody>
		</Table>
		<div className="flex items-center justify-end py-4 space-x-2">
			<Button variant="defaultOutline" size="sm" onClick={table.previousPage} className="select-none"
				disabled={paginationState.pageIndex === 0}>
				<ArrowLeftIcon />
				Previous
			</Button>

			<div className="grow"></div>

			<div className="text-center">
				<dt className="text-sm/6 font-medium text-gray-500 dark:text-gray-400">Records</dt>
				<dd className="font-semibold tracking-tight">{addCommasToNumbers(totalRecords)}</dd>
			</div>
			{totalRecords > 0 && (<>
				<div>
					<Select defaultValue={table.getState().pagination.pageSize.toString()} onValueChange={(value) => {
						table.setPageSize(Number(value));
					}}>
						<SelectTrigger className="h-10 w-[80px]">
							<SelectValue />
						</SelectTrigger>
						<SelectContent side="top">
							{[20, 50, 100, 250].map((pageSize) => (<SelectItem key={pageSize} value={`${pageSize}`}>
								{pageSize}
							</SelectItem>))}
						</SelectContent>
					</Select>
				</div>

				{totalPages > 1 && (<>
					<div className="text-center">
						<dt className="text-sm/6 font-medium text-gray-500 dark:text-gray-400">Pages</dt>
						<dd className="font-semibold tracking-tight">{addCommasToNumbers(totalPages)}</dd>
					</div>
					<div className="text-center">
						<dt className="text-sm/6 font-medium text-gray-500 dark:text-gray-400">Page</dt>
						<dd className="font-semibold tracking-tight">{addCommasToNumbers(paginationState.pageIndex + 1)}</dd>
					</div>
				</>)}
			</>)}

			<div className="grow"></div>

			<Button variant="defaultOutline" size="sm" onClick={table.nextPage} className="select-none"
				disabled={paginationState.pageIndex === totalPages - 1}>
				Next
				<ArrowRightIcon />
			</Button>
		</div>
	</>);
}
