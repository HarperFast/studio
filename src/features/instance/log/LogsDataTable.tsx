'use client';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ReadLogItem } from '@/integrations/api/instance/status/getReadLog';
import { cn } from '@/lib/cn';
import { ColumnDef, flexRender, getCoreRowModel, Row, useReactTable } from '@tanstack/react-table';
import { Ref } from 'react';

interface DataTableProps<TData extends ReadLogItem, TValue> {
	columns: ColumnDef<ReadLogItem, TValue>[];
	data: TData[];
	onRowClick?: (row: Row<TData>) => void;
	containerClassName?: string;
	containerRef?: Ref<HTMLDivElement>;
}

function getLogLevelAccent(level: ReadLogItem['level']) {
	switch (level) {
		case 'error':
		case 'stderr':
			return 'border-l-destructive';
		case 'warn':
			return 'border-l-yellow-500';
		case 'notify':
			return 'border-l-green-500';
		default:
			return 'border-l-transparent';
	}
}

export function LogsDataTable<TData extends ReadLogItem, TValue>({
	columns,
	data,
	onRowClick,
	containerRef,
}: DataTableProps<TData, TValue>) {
	const table = useReactTable({
		data,
		columns,
		getCoreRowModel: getCoreRowModel(),
	});

	return (
		<Table
			className="text-xs"
			containerRef={containerRef}
			containerClassName="rounded-md bg-card dark:bg-black-dark logsTable max-h-[calc(100vh-(--spacing(48)))] overflow-y-auto md:max-h-[calc(100vh-(--spacing(40)))]"
		>
			<TableHeader>
				{table.getHeaderGroups().map((headerGroup) => (
					<TableRow key={headerGroup.id} className="border-b border-border">
						{headerGroup.headers.map((header) => {
							return (
								<TableHead
									key={header.id}
									className="p-4 max-w-96 sticky top-0 z-10 border-b border-border bg-card dark:bg-black-dark"
								>
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
						table.getRowModel().rows.map((row) => (
							<TableRow
								key={row.id}
								data-state={row.getIsSelected() && 'selected'}
								className={cn(
									'hover:bg-muted/20 data-[state=selected]:bg-muted max-w-full border-l-2',
									getLogLevelAccent(row.original.level),
									onRowClick && 'cursor-pointer',
								)}
								onClick={() => onRowClick?.(row as Row<TData>)}
							>
								{row.getVisibleCells().map((cell) => (
									<TableCell key={cell.id} className="p-2">
										{flexRender(cell.column.columnDef.cell, cell.getContext())}
									</TableCell>
								))}
							</TableRow>
						))
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
	);
}
