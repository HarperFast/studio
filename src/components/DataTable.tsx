'use client';

import { ColumnDef, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { Fragment, ReactNode } from 'react';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface DataTableProps<TData, TValue> {
	columns: ColumnDef<TData, TValue>[];
	data: TData[];
	/** Optionally wrap each rendered row, e.g. with a right-click context menu. */
	renderRowWrapper?: (rowData: TData, row: ReactNode) => ReactNode;
}

export function DataTable<TData, TValue>({ columns, data, renderRowWrapper }: DataTableProps<TData, TValue>) {
	const table = useReactTable({
		data,
		columns,
		getCoreRowModel: getCoreRowModel(),
	});

	return (
		<div className="bg-card dark:bg-black-dark rounded-md">
			<Table>
				<TableHeader>
					{table.getHeaderGroups().map((headerGroup) => (
						<TableRow key={headerGroup.id} className="border-none">
							{headerGroup.headers.map((header) => {
								return (
									<TableHead key={header.id} className="p-4" style={{ width: `${header.getSize()}%` }}>
										{header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
									</TableHead>
								);
							})}
						</TableRow>
					))}
				</TableHeader>
				<TableBody className="bg-background dark:bg-black">
					{table.getRowModel().rows?.length
						? (
							table.getRowModel().rows.map((row) => {
								const rowElement = (
									<TableRow
										data-state={row.getIsSelected() && 'selected'}
										className="hover:bg-muted/10 data-[state=selected]:bg-muted"
									>
										{row.getVisibleCells().map((cell) => (
											<TableCell key={cell.id} className="p-4" style={{ width: `${cell.column.getSize()}%` }}>
												{flexRender(cell.column.columnDef.cell, cell.getContext())}
											</TableCell>
										))}
									</TableRow>
								);
								return (
									<Fragment key={row.id}>
										{renderRowWrapper ? renderRowWrapper(row.original, rowElement) : rowElement}
									</Fragment>
								);
							})
						)
						: (
							<TableRow>
								<TableCell colSpan={columns.length} className="h-24 text-center">
									No results.
								</TableCell>
							</TableRow>
						)}
				</TableBody>
			</Table>
		</div>
	);
}
