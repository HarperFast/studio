import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { flexRender, Header, RowData } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown, GripVerticalIcon } from 'lucide-react';
import * as React from 'react';
import { useCallback } from 'react';

export interface TableProps extends React.ComponentProps<'table'> {
	containerClassName?: string;
}

export function Table({ className, containerClassName, ...props }: TableProps) {
	return (
		<div data-slot="table-container" className={cn('relative w-full overflow-x-auto', containerClassName)}>
			<table data-slot="table" className={cn('w-full caption-bottom text-sm', className)} {...props} />
		</div>
	);
}

export function TableHeader({ className, ...props }: React.ComponentProps<'thead'>) {
	return <thead data-slot="table-header" className={cn('[&_tr]:border-b', className)} {...props} />;
}

export function TableBody({ className, ...props }: React.ComponentProps<'tbody'>) {
	return <tbody data-slot="table-body" className={cn('[&_tr:last-child]:border-0', className)} {...props} />;
}

export function TableFooter({ className, ...props }: React.ComponentProps<'tfoot'>) {
	return (
		<tfoot
			data-slot="table-footer"
			className={cn('bg-muted/50 border-t font-medium [&>tr]:last:border-b-0', className)}
			{...props}
		/>
	);
}

export function TableRow({ className, ...props }: React.ComponentProps<'tr'>) {
	return (
		<tr data-slot="table-row" className={cn('border-b border-grey-700 transition-colors', className)} {...props} />
	);
}

export function TableHead({ className, ...props }: React.ComponentProps<'th'>) {
	return (
		<th
			data-slot="table-head"
			className={cn(
				'h-10 text-left align-middle font-medium whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]',
				className,
			)}
			{...props}
		/>
	);
}

export function TableHeadSortable<TData extends RowData>({
	header,
	onColumnClick,
	...props
}: React.ComponentProps<'th'> & {
	header: Header<TData, unknown>;
	onColumnClick?: (accessorKey: string, willSortByAscending: boolean) => void;
}) {
	const onClickSort = useCallback(() => {
		header.column.toggleSorting(header.column.getIsSorted() === 'asc');
		const willSortByAscending = header.column.getIsSorted() === false || header.column.getIsSorted() !== 'asc';
		// @ts-expect-error The accessorKey isn't accessible.
		onColumnClick?.(header.column.columnDef.accessorKey, willSortByAscending);
	}, [header, onColumnClick]);
	const enableSorting = header.column.columnDef.enableSorting;
	const enableResizing = header.column.columnDef.enableResizing;
	const content = header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext());
	const resetSize = useCallback(() => {
		header.column.resetSize();
	}, [header]);
	return <TableHead
		{...props}
		style={{ width: `${header.getSize()}px` }}
		className={enableSorting ? 'px-0' : 'px-2'}
	>
		<div className="flex items-center justify-between">
			{enableSorting ? (
				<Button
					type="button"
					variant="ghost"
					className={cn('rounded-none', !header.column.getIsSorted() || header.column.getIsSorted() === 'asc' ? 'cursor-n-resize' : 'cursor-s-resize')}
					onClick={onClickSort}>
					{content}
					{header.column.getIsSorted() === 'asc'
						? <ArrowUp />
						: header.column.getIsSorted() === 'desc'
							? <ArrowDown />
							: <ArrowUpDown className="text-gray-600" />}
				</Button>
			) : (
				content
			)}
			{enableResizing && (
				<Button
					type="button"
					variant="ghost"
					className="cursor-col-resize"
					onMouseDown={header.getResizeHandler()} // for desktop
					onTouchStart={header.getResizeHandler()} // for mobile
					onDoubleClick={resetSize}
					style={{
						transform: header.column.getIsResizing()
							? `translateX(${header.getContext().table.getState().columnSizingInfo.deltaOffset}px)`
							: '',
					}}
				>
					<GripVerticalIcon />
				</Button>
			)}
		</div>
	</TableHead>;
}

export function TableCell({ className, ...props }: React.ComponentProps<'td'>) {
	return (
		<td
			data-slot="table-cell"
			className={cn(
				'align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]',
				className,
			)}
			{...props}
		/>
	);
}

export function TableCaption({ className, ...props }: React.ComponentProps<'caption'>) {
	return (
		<caption data-slot="table-caption" className={cn('text-muted-foreground mt-4 text-sm', className)} {...props} />
	);
}
