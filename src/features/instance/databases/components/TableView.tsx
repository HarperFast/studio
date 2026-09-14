'use client';

import { LoadingSubtle } from '@/components/LoadingSubtle';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableHeadSortable,
	TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/cn';
import { onClickStopPropagation } from '@/lib/onClickStopPropagation';
import { Cell, ColumnDef, Row, studioTableFeatures } from '@/lib/table';
import {
	ColumnSizingState,
	ColumnVisibilityState,
	flexRender,
	OnChangeFn,
	RowData,
	useTable,
} from '@tanstack/react-table';
import {
	Dispatch,
	ReactNode,
	SetStateAction,
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from 'react';
import type { MouseEvent, RefObject } from 'react';
import { UseFormReturn } from 'react-hook-form';
import { z } from 'zod';
import { ColumnFilters, ColumnFiltersSchema } from './ColumnFilters';
import { TablePagination } from './TablePagination';

// Width of the sticky selection gutter. Not a TanStack column (it isn't sortable, resizable,
// hideable or filterable), so the width lives here and the resize guide adds it back below.
const SELECT_COLUMN_WIDTH = 32;
// The gutter's right-hand divider, drawn as an inset shadow rather than `border-r`. The table is
// `border-collapse: collapse` (Tailwind's preflight), where a cell's borders belong to the table's
// border grid instead of the cell's own box -- so a collapsed border stays put while the sticky cell
// slides over it, leaving a 1px seam that the scrolled rows show through. A shadow paints inside the
// cell's background box and travels with it.
const SELECT_COLUMN_DIVIDER = 'shadow-[inset_-1px_0_0_var(--color-border)]';

/**
 * Wiring for the sticky checkbox column. Rows are addressed by their primary-key value -- the same
 * value the delete operation takes -- rather than by TanStack's row selection state, whose row ids
 * are strings and would have to be mapped back to the original (often numeric) keys to delete with.
 *
 * The owner supplies only the selected set and the two toggles; which rows are on screen, and
 * therefore what "all" means, is derived here from the rows actually being rendered.
 */
/**
 * The value a row is addressed by for selection and deletion, or `undefined` when it has none.
 *
 * `Object.hasOwn` rather than a plain property read: a table may legally declare a primary key
 * named `constructor`, `toString` or `valueOf`, and a row that doesn't carry that attribute (the
 * #1199 shape) would otherwise resolve to the inherited `Object.prototype` member -- a function,
 * which reads as non-null so the row looks selectable, serializes to `null` in the delete, and is
 * the *same reference* for every such row, so ticking one would tick them all.
 */
export function rowSelectionKey(row: unknown, primaryKey: string | undefined): unknown {
	if (!primaryKey || typeof row !== 'object' || row === null || !Object.hasOwn(row, primaryKey)) {
		return undefined;
	}
	const value = (row as Record<string, unknown>)[primaryKey];
	return value == null ? undefined : value;
}

export interface TableRowSelection {
	selectedKeys: ReadonlySet<unknown>;
	toggleRow: (key: unknown) => void;
	/** `keys` is every selectable row on the page, so the owner never recomputes them. */
	toggleAll: (keys: unknown[], selectAll: boolean) => void;
	/** Applies one state to a whole shift-click range. */
	setRangeSelected: (keys: unknown[], selected: boolean) => void;
}

interface BrowseDataTableProps<TData extends RowData> {
	applyFilters: () => void;
	columnFiltersForm: UseFormReturn<z.infer<typeof ColumnFiltersSchema>>;
	columns: ColumnDef<TData>[];
	columnVisibility: ColumnVisibilityState;
	columnSizing: ColumnSizingState;
	setColumnSizing: OnChangeFn<ColumnSizingState>;
	data?: TData[];
	/** Shown instead of the rows once a result set has arrived empty. See `EmptyResultSet`. */
	emptyState?: ReactNode;
	isFetching?: boolean;
	onColumnClick?: (accessorKey: string, isDescending: boolean) => void;
	filtersToggled: boolean;
	onRowClick?: (row: Row<TData>) => void;
	pageIndex: number;
	pageSize: number;
	primaryKey: string;
	// Omitted when the user can't delete records: no selection column is rendered at all.
	rowSelection?: TableRowSelection;
	// Canonical identity for the rows on screen (instance + table + page + sort + filters + cache mode).
	resultSetKey: string;
	// Identifies which table is on screen, so a new set of columns starts scrolled to the left.
	tableIdentity: string;
	setPageIndex: Dispatch<SetStateAction<number>>;
	setPageSize: Dispatch<SetStateAction<number>>;
	totalPages?: number;
	totalRecords?: number;
	isEstimatedCount?: boolean;
	estimatedRange?: [number, number];
	isExactCountFetching?: boolean;
	isExactCountError?: boolean;
	onRequestExactCount?: () => void;
}

export function TableView<TData extends RowData>({
	applyFilters,
	columnFiltersForm,
	columns,
	columnVisibility,
	columnSizing,
	setColumnSizing,
	data,
	emptyState,
	isFetching,
	onColumnClick,
	onRowClick,
	pageIndex,
	pageSize,
	primaryKey,
	rowSelection,
	resultSetKey,
	tableIdentity,
	setPageIndex,
	setPageSize,
	filtersToggled,
	totalPages,
	totalRecords,
	isEstimatedCount,
	estimatedRange,
	isExactCountFetching,
	isExactCountError,
	onRequestExactCount,
}: BrowseDataTableProps<TData>) {
	const table = useTable({
		features: studioTableFeatures,
		data: data || [],
		columns,
		// Rows arrive already paged and already sorted from the server, so the client-side row
		// models must not touch them. (v8 achieved this by simply not registering their row models;
		// v9 shares one feature set across studio's tables, so it is opted out per table instead.)
		manualSorting: true,
		enableColumnResizing: true,
		columnResizeMode: 'onEnd',
		onColumnSizingChange: setColumnSizing,
		defaultColumn: {
			// Wide enough that the header title + sort/resize controls never collide when shrinking.
			minSize: 80,
		},
		state: {
			columnVisibility,
			columnSizing,
		},
	});

	// A row is only selectable if it can be addressed by the primary key the delete operation takes;
	// a table whose declared primary key doesn't match how its rows are stored has rows that can't be
	// (see #1199), and they get a disabled checkbox rather than one that selects an undeletable row.
	const isSelectable = !!rowSelection && !!primaryKey;
	const selectableKeys = useMemo<unknown[]>(() => {
		if (!isSelectable) {
			return [];
		}
		return (data ?? [])
			.map((row) => rowSelectionKey(row, primaryKey))
			.filter((key) => key !== undefined);
	}, [isSelectable, data, primaryKey]);
	const selectedOnPage = rowSelection
		? selectableKeys.filter((key) => rowSelection.selectedKeys.has(key)).length
		: 0;
	const allSelected = selectableKeys.length > 0 && selectedOnPage === selectableKeys.length;
	const someSelected = selectedOnPage > 0 && !allSelected;

	// Where a shift-click measures FROM -- a position only. The direction comes from the row clicked,
	// so a shift-click always does what the row under the pointer is visibly about to do. Held as a
	// key, not an index, so a row set that moves underneath it fails to find the anchor and degrades
	// to a plain pick rather than measuring from whatever row now sits there.
	const [anchorKey, setAnchorKey] = useState<unknown>(undefined);
	const selectRow = useCallback((key: unknown, extendRange: boolean) => {
		if (!rowSelection) {
			return;
		}
		const anchorIndex = extendRange ? selectableKeys.indexOf(anchorKey) : -1;
		const targetIndex = selectableKeys.indexOf(key);
		if (anchorIndex === -1 || targetIndex === -1) {
			// No range to measure: a plain pick, which also becomes the anchor for the next shift.
			rowSelection.toggleRow(key);
			setAnchorKey(key);
			return;
		}
		const [from, to] = anchorIndex <= targetIndex
			? [anchorIndex, targetIndex]
			: [targetIndex, anchorIndex];
		// The range runs over SELECTABLE rows, so it steps over any row in between that has no
		// primary key to be addressed by rather than stopping at it.
		//
		rowSelection.setRangeSelected(selectableKeys.slice(from, to + 1), !rowSelection.selectedKeys.has(key));
		// The anchor stays put, so shift-clicking further out re-measures from the same origin.
	}, [rowSelection, selectableKeys, anchorKey]);

	// Drag state. Direction is fixed at mousedown by the row pressed, as for a shift-click. `useRef`
	// because it changes on every row crossed and nothing renders from it directly.
	const dragRef = useRef<
		| {
			originKey: unknown;
			selected: boolean;
			/** The selection as it stood when the drag began, so rows it backs off revert exactly. */
			snapshot: ReadonlySet<unknown>;
			applied: unknown[];
			lastKey: unknown;
		}
		| null
	>(null);
	// A press that began in the gutter must never reach the row's own click, whatever it does next.
	// Releasing on a different cell of the SAME row resolves the click on the `tr`, which the gutter
	// cell's stopPropagation can't catch, and the record editor opens on what was meant to be a tick.
	const pressedInGutterRef = useRef(false);
	// Whether a drag actually crossed a row. The checkbox consults this separately: a drag that
	// wanders back and releases on the checkbox it started from would otherwise toggle the origin
	// straight back off, leaving the one row the pointer never left unselected.
	const dragMovedRef = useRef(false);

	const beginRowDrag = useCallback(
		(key: unknown, event: { button: number; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => {
			// Left button only, and never under a modifier: shift already means "extend from the anchor",
			// and starting a drag would overwrite the anchor before the click could read it.
			if (
				!rowSelection || key === undefined || event.button !== 0 || event.shiftKey || event.ctrlKey || event.metaKey
			) {
				return;
			}
			pressedInGutterRef.current = true;
			dragRef.current = {
				originKey: key,
				selected: !rowSelection.selectedKeys.has(key),
				snapshot: new Set(rowSelection.selectedKeys),
				applied: [],
				lastKey: key,
			};
		},
		[rowSelection],
	);

	const dragOverRow = useCallback((key: unknown, buttonsHeld: number) => {
		const drag = dragRef.current;
		if (!drag) {
			return;
		}
		// Releasing outside the window delivers no mouseup, so the drag would still be live when the
		// pointer came back and would carry on selecting with nothing held down. Every mouseover
		// reports which buttons are actually down, which is the only account of that we get.
		if ((buttonsHeld & 1) === 0) {
			dragRef.current = null;
			return;
		}
		if (!rowSelection || key === undefined || key === drag.lastKey) {
			return;
		}
		const originIndex = selectableKeys.indexOf(drag.originKey);
		const targetIndex = selectableKeys.indexOf(key);
		if (originIndex === -1 || targetIndex === -1) {
			return;
		}
		drag.lastKey = key;
		const [from, to] = originIndex <= targetIndex
			? [originIndex, targetIndex]
			: [targetIndex, originIndex];
		const range = selectableKeys.slice(from, to + 1);
		const inRange = new Set(range);
		// Rows the drag has backed off go back to what they were when it started, so pulling the
		// pointer in again shrinks the range instead of leaving a trail behind it.
		const leaving = drag.applied.filter((applied) => !inRange.has(applied));
		const restoreOn = leaving.filter((left) => drag.snapshot.has(left));
		const restoreOff = leaving.filter((left) => !drag.snapshot.has(left));
		if (restoreOn.length) {
			rowSelection.setRangeSelected(restoreOn, true);
		}
		if (restoreOff.length) {
			rowSelection.setRangeSelected(restoreOff, false);
		}
		rowSelection.setRangeSelected(range, drag.selected);
		drag.applied = range;
		setAnchorKey(drag.originKey);
		dragMovedRef.current = true;
	}, [rowSelection, selectableKeys]);

	// The release that ends a drag lands wherever the pointer is -- often outside the grid, and
	// sometimes outside the window -- so the listener has to be on the window rather than a row.
	//
	// The press is watched here too, and that is load-bearing rather than tidy: a drag that ends on a
	// different row produces no click at all, so the flags it armed would still be standing when the
	// user next clicked a row, and swallow that click instead. Clearing them on every press means
	// only the press's own trailing click can be suppressed. It has to be the CAPTURE phase, which
	// runs before the gutter's own mousedown -- on the bubble phase this would undo the flag the
	// gutter had just set.
	useEffect(() => {
		const endDrag = () => {
			dragRef.current = null;
		};
		const beginPress = () => {
			pressedInGutterRef.current = false;
			dragMovedRef.current = false;
		};
		window.addEventListener('mouseup', endDrag);
		window.addEventListener('mousedown', beginPress, true);
		return () => {
			window.removeEventListener('mouseup', endDrag);
			window.removeEventListener('mousedown', beginPress, true);
		};
	}, []);

	// The shift anchor belongs to the rows on screen, exactly as the selection does. `TableView` is
	// rendered without a key, so it survives paging, sorting, a page-size change and a table switch;
	// an anchor left over from the last result set whose primary-key value happens to exist in this
	// one (integer keys collide across tables constantly) would turn the next plain shift-click into
	// a range over rows the user never anchored.
	useLayoutEffect(() => {
		setAnchorKey(undefined);
		dragRef.current = null;
	}, [resultSetKey]);

	const scrollContainerRef = useRef<HTMLDivElement>(null);
	const [scrollLeftAtResizeStart, setScrollLeftAtResizeStart] = useState(0);

	// The scroll container outlives the rows in it: React keeps this component and its DOM node across
	// paging, sorting, filtering and even a table switch, so its offsets survive too and the next result
	// set opens wherever the last one was left. Scroll position belongs to the rows, not to the node, so
	// it is reset whenever they change -- vertically for a new result set, and sideways as well when the
	// table itself changes, since those are different columns entirely.
	useLayoutEffect(() => {
		const container = scrollContainerRef.current;
		if (container) {
			container.scrollTop = 0;
		}
	}, [resultSetKey]);
	useLayoutEffect(() => {
		const container = scrollContainerRef.current;
		if (container) {
			container.scrollTop = 0;
			container.scrollLeft = 0;
		}
	}, [tableIdentity]);

	// During a column resize, preview where the new right edge will land with a full-height guide line.
	// columnResizeMode is 'onEnd', so the column width doesn't change until release -- the guide is the
	// live feedback. Its x is the sum of column widths up to the resizing one, plus the (clamped) drag delta.
	const columnResizing = table.state.columnResizing;
	const resizingColumnId = columnResizing.isResizingColumn;
	useLayoutEffect(() => {
		if (resizingColumnId) {
			setScrollLeftAtResizeStart(scrollContainerRef.current?.scrollLeft ?? 0);
		}
	}, [resizingColumnId]);
	let resizeGuideLeft: number | null = null;
	if (resizingColumnId) {
		const minSize = table.options.defaultColumn?.minSize ?? 20;
		const startSize = table.getColumn(resizingColumnId)?.getSize() ?? 0;
		// The selection gutter sits left of every real column, so every edge shifts by its width.
		let edge = isSelectable ? SELECT_COLUMN_WIDTH : 0;
		for (const leafColumn of table.getVisibleLeafColumns()) {
			edge += leafColumn.getSize();
			if (leafColumn.id === resizingColumnId) {
				break;
			}
		}
		// Clamp to match the handle's own preview: the column can't shrink below minSize.
		// The guide sits outside the scroll container, so convert from table coordinates to container
		// coordinates using the scroll position captured when resizing started.
		resizeGuideLeft = edge + Math.max(columnResizing.deltaOffset ?? 0, minSize - startSize)
			- scrollLeftAtResizeStart;
	}

	// The empty state sits OUTSIDE the scroll container rather than in a spanning cell, so it centres
	// on what the user can see: a table wider than the viewport would otherwise centre its message
	// somewhere off to the right, past the last column.
	//
	// `data === undefined` alone, not `isFetching`: neither list query keeps the previous page's rows,
	// so an empty array is always this result set's own settled answer. Including `isFetching` would
	// swap a settled empty panel back to the spinner cell on every manual Refresh.
	const hasRows = table.getRowModel().rows.length > 0;
	const isAwaitingRows = data === undefined;
	const showEmptyPanel = !hasRows && !isAwaitingRows && !!emptyState;

	return (
		<>
			<div className="relative flex flex-col grow min-h-0">
				<Table
					containerRef={scrollContainerRef}
					// The container owns BOTH axes of scrolling. `overflow-x-auto` (Table's default) already
					// makes it a scroll container on both axes -- CSS computes `overflow-y: visible` to `auto`
					// as soon as the other axis isn't visible -- which also makes it the scrollport the sticky
					// header resolves against. So it has to actually scroll vertically (min-h-0 + a bounded
					// parent), otherwise the header would sit at its `top` offset inside a container that
					// never scrolls, i.e. floating over the first rows.
					containerClassName={cn(
						'rounded-t-md bg-card dark:bg-black-dark min-h-0 overflow-y-auto',
						// The empty panel below takes the leftover height instead, so the header shrinks to fit.
						showEmptyPanel ? 'shrink-0' : 'rounded-b-md grow',
					)}
					// table-fixed so columns hold their set/resized width exactly (content doesn't stretch
					// them); the trailing filler column below absorbs any leftover width so the rows still
					// reach the edge instead of leaving dead space.
					className="table-fixed"
				>
					<TableHeader>
						{table.getHeaderGroups().map((headerGroup) => (
							<TableRow key={headerGroup.id} className="border-none">
								{isSelectable && (
									// z-20: above the other sticky headers, which it crosses over when the
									// grid is scrolled sideways.
									<TableHead
										style={{ width: `${SELECT_COLUMN_WIDTH}px` }}
										className={cn(
											'sticky top-0 left-0 z-20 p-0 bg-card dark:bg-black-dark border-b border-border',
											SELECT_COLUMN_DIVIDER,
										)}
									>
										<SelectAllCheckbox
											checked={allSelected}
											indeterminate={someSelected}
											disabled={selectableKeys.length === 0}
											onToggle={() => {
												rowSelection.toggleAll(selectableKeys, !allSelected);
												setAnchorKey(allSelected ? undefined : selectableKeys[0]);
											}}
										/>
									</TableHead>
								)}
								{headerGroup.headers.map((header) => (
									<TableHeadSortable
										key={header.id}
										header={header}
										onColumnClick={onColumnClick}
										// A sortable title renders inside a Button carrying its own text-sm, so the
										// size has to be restated there or those headers stay larger than the rest.
										className="sticky top-0 z-10 bg-card dark:bg-black-dark border-b border-border font-mono text-[0.8rem] [&_button]:text-[0.8rem]"
									/>
								))}
								{/* Filler column: takes the remaining width so real columns stay tight. */}
								<TableHead
									aria-hidden
									className="w-full p-0 sticky top-0 z-10 bg-card dark:bg-black-dark border-b border-border"
								/>
							</TableRow>
						))}
					</TableHeader>
					{filtersToggled && (
						<ColumnFilters
							applyFilters={applyFilters}
							columnFiltersForm={columnFiltersForm}
							headerGroups={table.getHeaderGroups()}
							selectColumnWidth={isSelectable ? SELECT_COLUMN_WIDTH : undefined}
						/>
					)}
					{!showEmptyPanel && (
						/* border-y, not border: the grid spans the pane edge to edge, so it has no side
						   edges to draw -- and a collapsed side border would scroll with the content while
						   the sticky selection gutter stayed put, leaving a 1px seam at the scrollport
						   edge. */
						<TableBody className="bg-background dark:bg-black border-y border-border dark:border-grey-700">
							{hasRows
								? (table.getRowModel().rows.map((row) => (
									<TableBodyRow
										key={row.id}
										row={row}
										onRowClick={onRowClick}
										primaryKey={primaryKey}
										rowSelection={isSelectable ? rowSelection : undefined}
										onSelectRow={selectRow}
										onBeginDrag={beginRowDrag}
										onDragOver={dragOverRow}
										pressedInGutterRef={pressedInGutterRef}
										dragMovedRef={dragMovedRef}
									/>
								)))
								: (
									<TableRow>
										<TableCell
											colSpan={columns.length + 1 + (isSelectable ? 1 : 0)}
											className="h-24 text-center"
										>
											{isFetching || isAwaitingRows
												? <LoadingSubtle className="opacity-50 inline-block" />
												: <span>No results.</span>}
										</TableCell>
									</TableRow>
								)}
						</TableBody>
					)}
				</Table>
				{showEmptyPanel && (
					<div className="grow min-h-0 rounded-b-md bg-background dark:bg-black border border-t-0 border-border dark:border-grey-700">
						{emptyState}
					</div>
				)}
				{resizeGuideLeft !== null && (
					<div
						aria-hidden
						className="pointer-events-none absolute top-0 bottom-0 z-20 w-0.5 bg-primary"
						style={{ left: `${resizeGuideLeft}px` }}
					/>
				)}
			</div>
			<TablePagination
				pageIndex={pageIndex}
				pageSize={pageSize}
				totalPages={totalPages}
				totalRecords={totalRecords}
				isEstimatedCount={isEstimatedCount}
				estimatedRange={estimatedRange}
				isExactCountFetching={isExactCountFetching}
				isExactCountError={isExactCountError}
				onRequestExactCount={onRequestExactCount}
				setPageIndex={setPageIndex}
				setPageSize={setPageSize}
			/>
		</>
	);
}

/**
 * `indeterminate` is a DOM property with no HTML attribute behind it, so React can't render it --
 * it has to be assigned to the node.
 */
function SelectAllCheckbox(
	{ checked, indeterminate, disabled, onToggle }: {
		checked: boolean;
		indeterminate: boolean;
		disabled: boolean;
		onToggle: () => void;
	},
) {
	const ref = useRef<HTMLInputElement>(null);
	useLayoutEffect(() => {
		if (ref.current) {
			ref.current.indeterminate = indeterminate;
		}
	}, [indeterminate]);
	return (
		<SelectCellLabel>
			<input
				ref={ref}
				type="checkbox"
				aria-label={checked ? 'Deselect all records on this page' : 'Select all records on this page'}
				checked={checked}
				disabled={disabled}
				onChange={onToggle}
			/>
		</SelectCellLabel>
	);
}

/**
 * Fills the selection cell so the whole gutter is the hit target. A bare centred checkbox leaves the
 * surrounding padding dead — a click that lands there does nothing at all, since the cell also has to
 * swallow the click to keep the row from opening the record editor.
 */
function SelectCellLabel({ children }: { children: ReactNode }) {
	return <label className="flex h-full w-full items-center justify-center py-2">{children}</label>;
}

function TableBodyRow<TData extends RowData>(
	{ row, primaryKey, onRowClick, rowSelection, onSelectRow, onBeginDrag, onDragOver, pressedInGutterRef, dragMovedRef }:
		{
			row: Row<TData>;
			primaryKey?: string;
			onRowClick?: (row: Row<TData>) => void;
			rowSelection?: TableRowSelection;
			onSelectRow?: (key: unknown, extendRange: boolean) => void;
			onBeginDrag?: (key: unknown, event: MouseEvent<HTMLElement>) => void;
			onDragOver?: (key: unknown, buttonsHeld: number) => void;
			pressedInGutterRef?: RefObject<boolean>;
			dragMovedRef?: RefObject<boolean>;
		},
) {
	// TanStack memoizes getVisibleCells() and returns a fresh array whenever the
	// visible columns change, so depending on it keeps the body in step with the
	// header (a hidden column must leave the body too, not just the header).
	const visibleCells = row.getVisibleCells();
	const cells = useMemo(() => {
		const original = row.original as Record<string, unknown>;
		const isExpired = original && original.message === 'This entry has expired';

		if (isExpired) {
			if (visibleCells[0]?.column?.id === primaryKey) {
				return [
					<TableBodyRowCell key={visibleCells[0].id} cell={visibleCells[0]} />,
					<TableBodyRowExpiredSpan key="expired" colSpan={visibleCells.length - 1} />,
				];
			}
			return [
				<TableBodyRowExpiredSpan key="expired" colSpan={visibleCells.length} />,
			];
		}
		return visibleCells.map((cell) => <TableBodyRowCell key={cell.id} cell={cell} />);
	}, [row, primaryKey, visibleCells]);

	const selectionKey = rowSelection ? rowSelectionKey(row.original, primaryKey) : undefined;
	const isSelected = selectionKey !== undefined && !!rowSelection?.selectedKeys.has(selectionKey);

	return (
		<TableRow
			data-state={isSelected ? 'selected' : undefined}
			// `mouseOver`, not `mouseEnter`: React synthesises enter from over/out, and only the
			// bubbling form is reliable when the pointer crosses into a child cell mid-drag.
			onMouseOver={(event) => onDragOver?.(selectionKey, event.buttons)}
			// Shift-click, and a drag, would otherwise pull a text selection across the rows they
			// span. The guard belongs on mousedown, where the selection starts -- preventing the
			// click is already too late.
			onMouseDown={(event) => {
				if (rowSelection && event.shiftKey) {
					event.preventDefault();
				}
			}}
			onClick={(event) => {
				if (pressedInGutterRef?.current) {
					// This press began on a checkbox; the gutter owns it however it ended.
					return;
				}
				// A modified click selects where the pointer already is; shift extends from the anchor.
				// A row with no key to select by falls through to the editor rather than doing nothing.
				if (rowSelection && selectionKey !== undefined && (event.ctrlKey || event.metaKey || event.shiftKey)) {
					event.preventDefault();
					onSelectRow?.(selectionKey, event.shiftKey);
					return;
				}
				onRowClick?.(row);
			}}
			className={cn('hover:bg-muted/10 data-[state=selected]:bg-muted', onRowClick && 'cursor-pointer')}
		>
			{rowSelection && (
				<TableCell
					// The rows scroll *under* this cell, so its background has to be opaque -- which is
					// why it repeats the row's selected colour instead of letting the row show through.
					// It deliberately doesn't pick up the row's translucent hover tint for the same reason.
					className={cn(
						'sticky left-0 z-10 p-0',
						SELECT_COLUMN_DIVIDER,
						isSelected ? 'bg-muted' : 'bg-background dark:bg-black',
					)}
					// The row click opens the record editor; ticking the checkbox must not.
					onClick={onClickStopPropagation}
					onMouseDown={(event) => {
						// Stops the press pulling a text selection across the rows a drag crosses.
						// It also stops the checkbox taking focus, so that is restored by hand rather
						// than silently lost for anyone alternating mouse and keyboard.
						event.preventDefault();
						event.currentTarget.querySelector('input')?.focus();
						onBeginDrag?.(selectionKey, event);
					}}
				>
					<SelectCellLabel>
						<input
							type="checkbox"
							aria-label={isSelected ? 'Deselect record' : 'Select record'}
							checked={isSelected}
							// A row with no primary-key value can't be named in a delete, so it can't be selected.
							disabled={selectionKey === undefined}
							// Driven from `onClick`, not `onChange`: only the mouse event carries `shiftKey`,
							// which is what separates a range extend from a plain pick. Keyboard activation
							// arrives here as a click too (with `shiftKey` false unless it is being held).
							//
							// Deliberately NOT preventDefault: swallowing the activation also swallows the
							// `change` event React uses to reconcile a controlled checkbox, which leaves the
							// box rendering the opposite of the state it just set -- including the range case
							// where an already-checked row is re-selected and the prop never changes.
							onClick={(event) => {
								// A drag that crossed rows has already set this one; a trailing click here
								// would toggle the row it started from straight back off.
								if ((dragMovedRef?.current && event.detail !== 0) || selectionKey === undefined) {
									return;
								}
								onSelectRow?.(selectionKey, event.shiftKey);
							}}
							onChange={noopChange}
						/>
					</SelectCellLabel>
				</TableCell>
			)}
			{cells}
			{/* Filler cell matching the header's filler column. */}
			<TableCell aria-hidden className="p-0" />
		</TableRow>
	);
}

/** The click handler above owns the state; React only needs this to accept `checked` as controlled. */
function noopChange() {}

function TableBodyRowCell<TData extends RowData>({ cell }: { cell: Cell<TData> }) {
	const size = cell.column.getSize();
	return (
		<TableCell
			data-col-id={cell.column.id}
			// maxWidth pins the cell to the (resizable) column width so wider values truncate instead
			// of forcing the column open; width keeps narrow columns from collapsing below it.
			style={{ width: `${size}px`, maxWidth: `${size}px` }}
			className="px-2 py-2 font-mono text-[0.8rem] overflow-hidden text-ellipsis whitespace-nowrap"
		>
			{/* Object/array stringification lives in the column defs (renderPlainCell / RelationshipCell). */}
			{flexRender(cell.column.columnDef.cell, cell.getContext())}
		</TableCell>
	);
}

function TableBodyRowExpiredSpan({ colSpan }: { colSpan: number }) {
	return (
		<TableCell
			colSpan={colSpan}
			className="px-2 py-2 overflow-x-hidden max-w-32 text-ellipsis whitespace-nowrap"
		>
			<span className="text-muted-foreground">This entry has expired</span>
		</TableCell>
	);
}
