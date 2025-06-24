'use client';

import {
	ColumnDef, flexRender, getCoreRowModel, getPaginationRowModel, PaginationState, Row, SortingState, useReactTable,
} from '@tanstack/react-table';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import React, { Dispatch, SetStateAction } from 'react';

interface BrowseDataTableProps<TData, TValue> {
	columns: ColumnDef<TData, TValue>[];
	data: TData[];
	totalPages: number;
	totalRecords: number;
	onRowClick?: (row: Row<TData>) => void;
	onColumnClick?: (accessorKey: string, isDescending: boolean) => Promise<void>;
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
			pagination: paginationState,
			sorting: sortingState,
		},
		onPaginationChange: setPagination,
	});

	return (<>
			<div className="flex items-center justify-end py-4 space-x-2">
				{children}
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
				<Button variant="outline" size="sm" onClick={() => table.previousPage()}
								disabled={paginationState.pageIndex === 0}>
					Previous
				</Button>
				<Button variant="outline" size="sm" onClick={() => table.nextPage()}
								disabled={paginationState.pageIndex === totalPages - 1}>
					Next
				</Button>
			</div>
			{/*TODO: Take up full height with the remainder*/}
			<Table containerClassName="rounded-md bg-black-dark">
				<TableHeader>
					{table.getHeaderGroups().map((headerGroup) => (<TableRow key={headerGroup.id} className="border-none">
							{headerGroup.headers.map((header) => {
								return (<TableHead key={header.id} className="px-0">
										<Button type="button" variant="ghost" className="rounded-none" onClick={() => {
											header.column.toggleSorting(header.column.getIsSorted() === 'asc');
											const willSortByAscending = header.column.getIsSorted() === false || header.column.getIsSorted() !== 'asc';
											// @ts-expect-error accessorKey does exist unsure why ts is complaining
											onColumnClick?.(header.column.columnDef.accessorKey, willSortByAscending);
										}}>
											{header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
											{header.column.getIsSorted() === 'asc' ? <ArrowUp /> : header.column.getIsSorted() === 'desc' ?
												<ArrowDown /> : <ArrowUpDown className="text-gray-600" />}
										</Button>
									</TableHead>);
							})}
						</TableRow>))}
				</TableHeader>
				<TableBody className="bg-black border border-grey-700">
					{table.getRowModel().rows?.length ? (table.getRowModel().rows.map((row) => (
							<TableRow key={row.id} data-state={row.getIsSelected() && 'selected'} onClick={() => onRowClick?.(row)}
												className="hover:bg-muted/10 data-[state=selected]:bg-muted">
								{row.getVisibleCells().map((cell) => (<TableCell key={cell.id}
																																 className="py-2 px-3 overflow-x-hidden max-w-32 text-ellipsis whitespace-nowrap">
										{flexRender(cell.column.columnDef.cell, cell.getContext())}
									</TableCell>))}
							</TableRow>))) : (<TableRow>
							<TableCell colSpan={columns.length} className="h-24 text-center">
								No results.
							</TableCell>
						</TableRow>)}
				</TableBody>
			</Table>
		</>);
}
