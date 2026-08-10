'use client';

import { Loading } from '@/components/Loading';

import { Table, TableBody, TableCell, TableHeader, TableHeadSortable, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/cn';
import { ColumnDef, Row, studioTableFeatures } from '@/lib/table';
import { flexRender, PaginationState, RowData, SortingState, useTable } from '@tanstack/react-table';
import React, { Dispatch, SetStateAction } from 'react';

interface BrowseDataTableProps<TData extends RowData> {
	columns: ColumnDef<TData>[];
	data: TData[];
	isFetching?: boolean;
	totalPages?: number;
	totalRecords?: number;
	onRowClick?: (row: Row<TData>) => void;
	onColumnClick?: (accessorKey: string, isDescending: boolean) => void;
	paginationState?: {
		pageIndex: number;
		pageSize: number;
	};
	sortingState?: SortingState;
	setPagination?: Dispatch<SetStateAction<PaginationState>>;
	children?: React.ReactNode;
}

export function SimpleBrowseDataTable<TData extends RowData>({
	columns,
	data,
	isFetching,
	onRowClick,
	onColumnClick,
	sortingState,
	children,
}: BrowseDataTableProps<TData>) {
	const table = useTable({
		features: studioTableFeatures,
		data,
		columns,
		initialState: {
			// `?? []` matters: TanStack builds the initial state as `{ sorting: [], ...initialState }`,
			// so an explicit `sorting: undefined` key replaces the default and the first header click
			// throws in `toggleSorting`.
			sorting: sortingState ?? [],
		},
	});

	return (
		<>
			<div className="flex items-center justify-end space-x-2 pb-4">
				<div className="grow lg:hidden"></div>
				{children}
				<div className="grow hidden lg:visible"></div>
			</div>
			<Table containerClassName="rounded-md bg-card dark:bg-black-dark">
				<TableHeader>
					{table.getHeaderGroups().map((headerGroup) => (
						<TableRow key={headerGroup.id} className="border-none">
							{headerGroup.headers.map((header) => (
								<TableHeadSortable key={header.id} header={header} onColumnClick={onColumnClick} />
							))}
						</TableRow>
					))}
				</TableHeader>
				<TableBody className="bg-background dark:bg-black border border-border dark:border-grey-700">
					{table.getRowModel().rows?.length
						? (table.getRowModel().rows.map((row) => (
							<TableRow
								key={row.id}
								data-state={row.getIsSelected() && 'selected'}
								onClick={() => onRowClick?.(row)}
								className={cn('hover:bg-muted/10 data-[state=selected]:bg-muted', onRowClick && 'cursor-pointer')}
							>
								{row.getVisibleCells().map((cell) => (
									<TableCell
										key={cell.id}
										className="py-2 px-2 overflow-x-hidden max-w-32 text-ellipsis whitespace-nowrap"
										style={{ width: `${cell.column.getSize()}px` }}
									>
										{flexRender(cell.column.columnDef.cell, cell.getContext())}
									</TableCell>
								))}
							</TableRow>
						)))
						: (
							<TableRow>
								<TableCell colSpan={columns.length} className="h-24 text-center">
									{isFetching
										? (
											<div>
												<Loading className="p-12" />
											</div>
										)
										: <span>No results.</span>}
								</TableCell>
							</TableRow>
						)}
				</TableBody>
			</Table>
		</>
	);
}
