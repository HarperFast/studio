'use client';

import { Loading } from '@/components/Loading';

import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHeader, TableHeadSortable, TableRow } from '@/components/ui/table';
import { PAGE_SIZE_OPTIONS, TablePagination } from '@/features/instance/databases/components/TablePagination';
import { cn } from '@/lib/cn';
import { ColumnDef, Row, studioClientTableFeatures } from '@/lib/table';
import { flexRender, PaginationState, RowData, SortingState, useTable } from '@tanstack/react-table';
import { SearchIcon } from 'lucide-react';
import React, { useLayoutEffect, useState } from 'react';

const SMALLEST_PAGE_SIZE = PAGE_SIZE_OPTIONS[0];

interface BrowseDataTableProps<TData extends RowData> {
	columns: ColumnDef<TData>[];
	data: TData[];
	isFetching?: boolean;
	onRowClick?: (row: Row<TData>) => void;
	onColumnClick?: (accessorKey: string, isAscending: boolean) => void;
	sortingState?: SortingState;
	/**
	 * Adds a search box that filters the rows on the client. It matches every column whose values are
	 * strings or numbers, except one that sets `enableGlobalFilter: false`. `label` is the box's
	 * accessible name, and its placeholder unless `placeholder` is given.
	 */
	filter?: { label: string; placeholder?: string };
	/** Pages the rows on the client. The pager appears once the rows outnumber the smallest page. */
	paginated?: boolean;
	children?: React.ReactNode;
}

export function SimpleBrowseDataTable<TData extends RowData>({
	columns,
	data,
	isFetching,
	onRowClick,
	onColumnClick,
	sortingState,
	filter,
	paginated,
	children,
}: BrowseDataTableProps<TData>) {
	// `?? []` matters: `toggleSorting` reads the previous sorting state as an array, so an undefined one
	// makes the first header click throw.
	const [sorting, setSorting] = useState<SortingState>(() => sortingState ?? []);
	const [globalFilter, setGlobalFilter] = useState('');
	const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: SMALLEST_PAGE_SIZE });
	const toFirstPage = () => setPagination((current) => ({ ...current, pageIndex: 0 }));
	const table = useTable({
		features: studioClientTableFeatures,
		data,
		columns,
		manualFiltering: !filter,
		manualPagination: !paginated,
		// A re-sort or a new filter starts from the first page; new `data` does not. TanStack's own reset
		// also fires on every new `data` array, and these lists are polled, so any changed record (an org
		// member's `lastAccessedAt`, say) would throw the user back to page 1.
		autoResetPageIndex: false,
		state: { sorting, globalFilter, pagination },
		onSortingChange: (updater) => {
			setSorting(updater);
			toFirstPage();
		},
		onGlobalFilterChange: (updater) => {
			setGlobalFilter(updater);
			toFirstPage();
		},
		onPaginationChange: setPagination,
	});
	const matchingRowCount = table.getPrePaginatedRowModel().rows.length;
	const showPager = paginated && matchingRowCount > SMALLEST_PAGE_SIZE;
	const lastPageIndex = Math.max(table.getPageCount() - 1, 0);
	useLayoutEffect(() => {
		if (pagination.pageIndex > lastPageIndex) {
			setPagination((current) => ({ ...current, pageIndex: lastPageIndex }));
		}
	}, [pagination.pageIndex, lastPageIndex]);

	return (
		<>
			<div className="flex items-center justify-end space-x-2 pb-4">
				{filter && (
					<div className="relative mr-auto w-full max-w-xs">
						<SearchIcon
							className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
							aria-hidden="true"
						/>
						<Input
							type="search"
							aria-label={filter.label}
							placeholder={filter.placeholder ?? filter.label}
							className="pl-9"
							value={globalFilter}
							onChange={(event) => table.setGlobalFilter(event.target.value)}
						/>
					</div>
				)}
				<div className="grow lg:hidden"></div>
				{children}
				<div className="grow hidden lg:visible"></div>
			</div>
			<Table containerClassName="rounded-md border border-border dark:border-grey-700 bg-card dark:bg-black-dark">
				<TableHeader>
					{table.getHeaderGroups().map((headerGroup) => (
						<TableRow key={headerGroup.id} className="border-none">
							{headerGroup.headers.map((header) => (
								<TableHeadSortable key={header.id} header={header} onColumnClick={onColumnClick} />
							))}
						</TableRow>
					))}
				</TableHeader>
				<TableBody className="bg-background dark:bg-black">
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
			{showPager && (
				<TablePagination
					pageIndex={pagination.pageIndex}
					pageSize={pagination.pageSize}
					totalPages={table.getPageCount()}
					totalRecords={matchingRowCount}
					setPageIndex={table.setPageIndex}
					setPageSize={table.setPageSize}
				/>
			)}
		</>
	);
}
