import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { flexRender, Header, RowData } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown, GripVerticalIcon } from 'lucide-react';
import * as React from 'react';
import { useCallback } from 'react';

// Upper bound for double-click auto-fit so a very long value (e.g. a stringified object) can't
// stretch a column across the whole viewport.
const AUTO_FIT_MAX_SIZE = 500;
// Horizontal cell padding (px-2 => 8px each side) added back after measuring bare content.
const CELL_HORIZONTAL_PADDING = 16;
// Width of the right-edge resize handle strip; reserved when auto-fitting so it never overlaps the title.
const RESIZE_HANDLE_WIDTH = 16;

export interface TableProps extends React.ComponentProps<'table'> {
	containerClassName?: string;
	containerRef?: React.Ref<HTMLDivElement>;
}

export function Table({ className, containerClassName, containerRef, ...props }: TableProps) {
	return (
		<div
			ref={containerRef}
			data-slot="table-container"
			className={cn('relative w-full overflow-x-auto', containerClassName)}
		>
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
		<tr
			data-slot="table-row"
			className={cn('border-b border-grey-700 transition-colors', className)}
			{...props}
		/>
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
	className,
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
	// Only render resize handles for tables that explicitly opt in via `enableColumnResizing`.
	// TableHeadSortable is shared (e.g. SimpleBrowseDataTable), and TanStack's getCanResize()
	// defaults to enabled — so gating on getCanResize() alone would sprinkle handles onto every
	// table that uses this header, not just the browse table that wires up sizing + persistence.
	const enableResizing = header.getContext().table.options.enableColumnResizing === true
		&& header.column.getCanResize();
	const content = header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext());
	const table = header.getContext().table;
	const size = header.getSize();
	const minSize = header.column.columnDef.minSize ?? table.options.defaultColumn?.minSize ?? 20;
	// Double-click the handle to fit the column to its widest value rather than snapping back to the
	// default width. Content width is measured with a Range (the tight bounding box of the actual
	// text) so it works even when the cell is wider than its content; capped by AUTO_FIT_MAX_SIZE so
	// a huge value can't blow the column out.
	const autoFitColumn = useCallback((e: React.MouseEvent<HTMLElement>) => {
		const tableEl = e.currentTarget.closest('table');
		if (!tableEl) {
			header.column.resetSize();
			return;
		}
		const selector = `[data-col-id="${CSS.escape(header.column.id)}"]`;
		const range = document.createRange();
		const measure = (el: Element) => {
			range.selectNodeContents(el);
			return range.getBoundingClientRect().width;
		};
		let widest = 0;
		tableEl.querySelectorAll(`tbody ${selector}`).forEach((cell) => {
			widest = Math.max(widest, measure(cell));
		});
		// The header's flex row fills the cell, so derive its intrinsic width from the title's own
		// text width plus the width of the sort/resize controls beside it. `controls` is measured as
		// (all children) - (current title box), which is invariant to the title being truncated.
		const headerRow = tableEl.querySelector(`thead ${selector} > div`);
		const titleEl = headerRow?.querySelector('.truncate');
		if (headerRow && titleEl) {
			const childrenWidth = Array.from(headerRow.children).reduce(
				(sum, child) => sum + child.getBoundingClientRect().width,
				0,
			);
			const controls = childrenWidth - titleEl.getBoundingClientRect().width;
			widest = Math.max(widest, measure(titleEl) + controls + RESIZE_HANDLE_WIDTH);
		}
		const fitted = Math.min(Math.max(Math.ceil(widest) + CELL_HORIZONTAL_PADDING, minSize), AUTO_FIT_MAX_SIZE);
		table.setColumnSizing((old) => ({ ...old, [header.column.id]: fitted }));
	}, [header, table, minSize]);
	// Clamp the resize preview so the handle stops at the column's min width instead of sliding left
	// across the title while dragging (the actual resize commits on release).
	const previewOffset = header.column.getIsResizing()
		? Math.max(table.getState().columnSizingInfo.deltaOffset ?? 0, minSize - size)
		: 0;
	return (
		<TableHead
			{...props}
			data-col-id={header.column.id}
			style={{ width: `${size}px`, maxWidth: `${size}px` }}
			// relative (not overflow-hidden) so the absolute resize handle can render past the edge
			// while dragging; the inner content div does the truncation instead.
			// select-none on resizable headers so dragging the handle can't text-select the title.
			className={cn('relative', enableResizing && 'select-none', enableSorting ? 'px-0' : 'px-2', className)}
		>
			{/* pr leaves room for the right-edge resize handle so the title never sits under it. */}
			<div className={cn('flex items-center min-w-0 overflow-hidden', enableResizing && 'pr-4')}>
				{enableSorting
					? (
						<Button
							type="button"
							variant="ghost"
							className={cn(
								'rounded-none min-w-0',
								!header.column.getIsSorted() || header.column.getIsSorted() === 'asc'
									? 'cursor-n-resize'
									: 'cursor-s-resize',
							)}
							onClick={onClickSort}
						>
							<span className="truncate">{content}</span>
							{header.column.getIsSorted() === 'asc'
								? <ArrowUp className="shrink-0" />
								: header.column.getIsSorted() === 'desc'
								? <ArrowDown className="shrink-0" />
								: <ArrowUpDown className="shrink-0 text-gray-600" />}
						</Button>
					)
					: <span className="truncate">{content}</span>}
			</div>
			{enableResizing && (
				<div
					aria-hidden
					// w-4 hit area (wider than the visible grip); text-muted-foreground so the grip is
					// visible at rest in both light and dark themes (was gray-600, near-invisible until hover).
					className="absolute top-0 right-0 z-10 flex h-full w-4 cursor-col-resize items-center justify-center text-muted-foreground hover:text-foreground"
					onMouseDown={header.getResizeHandler()} // for desktop
					onTouchStart={header.getResizeHandler()} // for mobile
					onDoubleClick={autoFitColumn}
					style={{
						transform: header.column.getIsResizing() ? `translateX(${previewOffset}px)` : '',
					}}
				>
					<GripVerticalIcon className="size-3.5" />
				</div>
			)}
		</TableHead>
	);
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
