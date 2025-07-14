'use client';

import {
	ColumnDef, flexRender, getCoreRowModel, getPaginationRowModel, PaginationState, Row, SortingState, useReactTable,
} from '@tanstack/react-table';

import {
	Table,
	TableBody,
	TableCell,
	TableHeader,
	TableHeadSortable,
	TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import React, { Dispatch, SetStateAction } from 'react';
import { Loading } from '@/components/Loading';

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

	const paging = <>
		<div className="flex items-center space-x-2">
			<p className="text-sm font-medium">Rows per page</p>
			<Select defaultValue={table.getState().pagination.pageSize.toString()} onValueChange={(value) => {
				table.setPageSize(Number(value));
			}}>
				<SelectTrigger className="h-8 w-[80px]">
					<SelectValue />
				</SelectTrigger>
				<SelectContent side="top">
					{[20, 50, 100, 250].map((pageSize) => (<SelectItem key={pageSize} value={`${pageSize}`}>
						{pageSize}
					</SelectItem>))}
				</SelectContent>
			</Select>
		</div>
		<span>Total Rows: {totalRecords}</span>
		<Button variant="defaultOutline" size="sm" onClick={table.previousPage} className="select-none"
				disabled={paginationState.pageIndex === 0}>
			Previous
		</Button>
		<Button variant="defaultOutline" size="sm" onClick={table.nextPage} className="select-none"
				disabled={paginationState.pageIndex === totalPages - 1}>
			Next
		</Button>
	</>;

	return (<>
		<div className="flex items-center justify-end space-x-2 py-4">
			<div className="grow lg:hidden"></div>
			{children}
			<div className="grow hidden lg:visible"></div>
			<div className="items-center justify-end space-x-2 hidden lg:flex">{paging}</div>
		</div>
		<Table containerClassName="rounded-md bg-black-dark">
			<TableHeader>
				{table.getHeaderGroups().map((headerGroup) => (<TableRow key={headerGroup.id} className="border-none">
					{headerGroup.headers.map((header) => <TableHeadSortable key={header.id} header={header} onColumnClick={onColumnClick} />)}
				</TableRow>))}
			</TableHeader>
			<TableBody className="bg-black border border-grey-700">
				{table.getRowModel().rows?.length ? (table.getRowModel().rows.map((row) => (
					<TableRow key={row.id} data-state={row.getIsSelected() && 'selected'}
							  onClick={() => onRowClick?.(row)}
							  className="hover:bg-muted/10 data-[state=selected]:bg-muted">
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
		<div className="flex items-center justify-end py-4 space-x-2 lg:invisible">{paging}</div>
	</>);
}
