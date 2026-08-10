'use client';

import { ColumnDef, studioTableFeatures } from '@/lib/table';
import { flexRender, RowData, useTable } from '@tanstack/react-table';
import { Fragment, ReactNode } from 'react';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface DataTableProps<TData extends RowData> {
	columns: ColumnDef<TData>[];
	data: TData[];
	/** Optionally wrap each rendered row, e.g. with a right-click context menu. */
	renderRowWrapper?: (rowData: TData, row: ReactNode) => ReactNode;
}

export function DataTable<TData extends RowData>({ columns, data, renderRowWrapper }: DataTableProps<TData>) {
	const table = useTable({
		features: studioTableFeatures,
		data,
		columns,
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
