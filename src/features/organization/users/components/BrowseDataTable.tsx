'use client';

import {
	ColumnDef,
	flexRender,
	getCoreRowModel,
	getSortedRowModel,
	PaginationState,
	Row,
	SortingState,
	useReactTable,
} from '@tanstack/react-table';

import { Table, TableBody, TableCell, TableHeader, TableHeadSortable, TableRow } from '@/components/ui/table';
import React, { Dispatch, SetStateAction } from 'react';
import { Loading } from '@/components/Loading';

interface BrowseDataTableProps<TData, TValue> {
	columns: ColumnDef<TData, TValue>[];
	data: TData[];
	isFetching?: boolean;
	totalPages?: number;
	totalRecords?: number;
	onRowClick?: (row: Row<TData>) => void;
	onColumnClick?: (accessorKey: string, isDescending: boolean) => void;
	paginationState?: {
		pageIndex: number; pageSize: number;
	};
	sortingState: SortingState;
	setPagination?: Dispatch<SetStateAction<PaginationState>>;
	children?: React.ReactNode;
}

export function BrowseDataTable<TData, TValue>({
	columns,
	data,
	isFetching,
	onRowClick,
	onColumnClick,
	sortingState,
	children,
}: BrowseDataTableProps<TData, TValue>) {
	const table = useReactTable({
		data,
		columns,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		initialState: {
			sorting: sortingState,
		},
	});

	return (<>
		<div className="flex items-center justify-end space-x-2 py-4">
			<div className="grow lg:hidden"></div>
			{children}
			<div className="grow hidden lg:visible"></div>
		</div>
		<Table containerClassName="rounded-md bg-black-dark">
			<TableHeader>
				{table.getHeaderGroups().map((headerGroup) => (<TableRow key={headerGroup.id} className="border-none">
					{headerGroup.headers.map((header) => (
						<TableHeadSortable key={header.id} header={header} onColumnClick={onColumnClick} />))}
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
	</>);
}
