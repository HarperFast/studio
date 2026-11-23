import { Button } from '@/components/ui/button';
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from '@/components/ui/dropdownMenu';
import { Table, TableBody, TableCell, TableHeader, TableHeadSortable, TableRow } from '@/components/ui/table';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { ReadLogItem } from '@/integrations/api/instance/status/getReadLog';
import { cn } from '@/lib/cn';
import { LocalStorageKeys } from '@/lib/storage/localStorageKeys';
import { Cell, ColumnDef, studioTableFeatures } from '@/lib/table';
import { ColumnSizingState, ColumnVisibilityState, flexRender, useTable } from '@tanstack/react-table';
import { ArrowDownIcon, ArrowUpIcon, ChevronRightIcon, Columns3Icon } from 'lucide-react';
import { Dispatch, Fragment, memo, Ref, SetStateAction, useId, useLayoutEffect, useMemo, useRef } from 'react';
import { LogDetails } from './components/LogDetails';
import { logKey } from './hooks/mergeReadLogs';
import { LogFilters } from './logView';

const timestampFormatter = new Intl.DateTimeFormat(undefined, {
	month: '2-digit',
	day: '2-digit',
	hour: '2-digit',
	minute: '2-digit',
	second: '2-digit',
	hour12: false,
	fractionalSecondDigits: 3,
});

const columns: ColumnDef<ReadLogItem>[] = [
	{ id: 'expand', header: '', size: 40, minSize: 40, maxSize: 40, enableResizing: false, enableHiding: false },
	{
		accessorKey: 'timestamp',
		header: 'Timestamp',
		size: 190,
		enableHiding: false,
		cell: ({ row }) => (
			<time title={row.original.timestamp} className="text-muted-foreground tabular-nums">
				{Number.isFinite(Date.parse(row.original.timestamp))
					? timestampFormatter.format(new Date(row.original.timestamp))
					: row.original.timestamp}
			</time>
		),
	},
	{
		accessorKey: 'level',
		header: 'Level',
		size: 90,
		cell: ({ row }) => (
			<span
				className={cn(
					'capitalize',
					['error', 'stderr'].includes(row.original.level)
						? 'text-destructive'
						: row.original.level === 'warn'
						? 'text-yellow-600 dark:text-yellow-400'
						: 'text-muted-foreground',
				)}
			>
				{row.original.level}
			</span>
		),
	},
	{
		accessorKey: 'message',
		header: 'Message',
		size: 540,
		minSize: 240,
		enableHiding: false,
		cell: ({ row }) => <span data-column-content className="block truncate font-mono">{row.original.message}</span>,
	},
	{ accessorKey: 'thread', header: 'Thread', size: 100 },
	{
		accessorKey: 'node',
		header: 'Node',
		size: 200,
		cell: ({ row }) => (
			<span data-column-content className="block truncate text-muted-foreground" title={row.original.node}>
				{row.original.node || 'Local'}
			</span>
		),
	},
	{ accessorKey: 'tags', header: 'Tags', size: 160, cell: ({ row }) => row.original.tags?.join(', ') },
];

const LogCellContent = memo(
	function LogCellContent({ cell }: { cell: Cell<ReadLogItem, unknown> }) {
		return flexRender(cell.column.columnDef.cell, cell.getContext());
	},
	(previous, next) =>
		previous.cell.row.original === next.cell.row.original && previous.cell.column === next.cell.column,
);

function logToggle(root: HTMLDivElement | null, key?: string) {
	return key ? root?.querySelector<HTMLButtonElement>(`button[data-log-toggle="${key}"]`) : undefined;
}

function revealExpandedLog(button: HTMLButtonElement, direction: -1 | 1 = 1) {
	const row = button.closest('tr');
	const container = row?.closest<HTMLElement>('[data-slot="table-container"]');
	if (!row || !container) { return; }
	container.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
	const viewport = container.getBoundingClientRect();
	const top = Math.max(
		viewport.top + container.clientTop,
		row.closest('table')?.tHead?.getBoundingClientRect().bottom ?? 0,
		0,
	);
	const bottom = Math.min(viewport.top + container.clientTop + container.clientHeight, window.innerHeight);
	const details = document.getElementById(button.getAttribute('aria-controls') ?? '');
	const prior = row.previousElementSibling;
	const candidate = direction < 0
		? prior?.querySelector('button[data-log-toggle]') ? prior : prior?.previousElementSibling
		: (details ?? row).nextElementSibling;
	let neighbor = candidate?.querySelector('button[data-log-toggle]') ? candidate : null;
	const message = details?.querySelector<HTMLElement>('[aria-label="Full log message"]');
	if (message) {
		const header = row.getBoundingClientRect();
		const panel = (details ?? row).getBoundingClientRect();
		const overhead = panel.bottom - header.top - message.getBoundingClientRect().height;
		const peek = neighbor
			? direction < 0
				? header.top - neighbor.getBoundingClientRect().top
				: neighbor.getBoundingClientRect().bottom - panel.bottom
			: 0;
		const minimum = Math.min(96, message.scrollHeight);
		let room = bottom - top - overhead - peek;
		if (room < minimum) {
			neighbor = null;
			room = bottom - top - overhead;
		}
		const banner = parseFloat(getComputedStyle(container).getPropertyValue('--notification-banner-height')) || 0;
		const fixedHeight = Math.ceil(window.innerHeight - room - banner);
		message.style.maxHeight =
			`max(${minimum}px, min(32rem, calc(100dvh - var(--notification-banner-height,0px) - ${fixedHeight}px)))`;
	}
	const start = (direction < 0 && neighbor ? neighbor : row).getBoundingClientRect().top;
	const end = (direction > 0 && neighbor ? neighbor : details ?? row).getBoundingClientRect().bottom;
	const offset = end - start > bottom - top || start < top ? start - top : Math.max(0, end - bottom);
	if (offset) { container.scrollTo({ top: container.scrollTop + offset, behavior: 'instant' }); }
}

export const LogsDataTable = memo(function LogsDataTable(
	{
		data,
		source,
		onInspect,
		containerRef,
		reversed,
		onReverse,
		selectedKey,
		expandedKeys,
		onExpandedChange,
	}: {
		data: ReadLogItem[];
		source: LogFilters['log_name'];
		onInspect: () => void;
		containerRef?: Ref<HTMLDivElement>;
		reversed: boolean;
		onReverse: () => void;
		selectedKey?: string;
		expandedKeys: ReadonlySet<string>;
		onExpandedChange: Dispatch<SetStateAction<Set<string>>>;
	},
) {
	const [storedSizing, setStoredSizing] = useLocalStorage<unknown>(LocalStorageKeys.LogsColumnSizing, {});
	const [storedVisibility, setStoredVisibility] = useLocalStorage<unknown>(LocalStorageKeys.LogsColumnVisibility, {
		tags: false,
	});
	const columnSizing: ColumnSizingState = useMemo(() => {
		const stored = storedSizing && typeof storedSizing === 'object' ? storedSizing as Record<string, unknown> : {};
		return Object.fromEntries(columns.flatMap(column => {
			const id = column.id ?? ('accessorKey' in column ? String(column.accessorKey) : '');
			const value = stored[id];
			return typeof value === 'number' && Number.isFinite(value) && value > 0
				? [[id, Math.max(column.minSize ?? 70, Math.min(value, column.maxSize ?? 2000))]]
				: [];
		}));
	}, [storedSizing]);
	const columnVisibility: ColumnVisibilityState = useMemo(() => {
		const stored = storedVisibility && typeof storedVisibility === 'object'
			? storedVisibility as Record<string, unknown>
			: {};
		return {
			tags: false,
			...Object.fromEntries(
				['level', 'thread', 'node', 'tags'].flatMap(id => typeof stored[id] === 'boolean' ? [[id, stored[id]]] : []),
			),
		};
	}, [storedVisibility]);

	const rootRef = useRef<HTMLDivElement>(null);
	const activeKey = useRef<string | undefined>(undefined);
	const pendingFocus = useRef<HTMLButtonElement | null>(null);
	const pendingDirection = useRef<-1 | 1>(1);
	const revealedSelection = useRef<string | undefined>(undefined);
	const id = useId();
	const table = useTable({
		features: studioTableFeatures,
		data,
		columns,
		getRowId: logKey,
		manualSorting: true,
		enableColumnResizing: true,
		columnResizeMode: 'onEnd',
		defaultColumn: { minSize: 70 },
		state: { columnSizing, columnVisibility },
		onColumnSizingChange: value => setStoredSizing(typeof value === 'function' ? value(columnSizing) : value),
		onColumnVisibilityChange: value =>
			setStoredVisibility(typeof value === 'function' ? value(columnVisibility) : value),
	});
	const rows = table.getRowModel().rows;
	useLayoutEffect(() => {
		const button = pendingFocus.current;
		pendingFocus.current = null;
		if (button?.isConnected) {
			button.focus({ preventScroll: true });
			revealExpandedLog(button, pendingDirection.current);
		} else if (selectedKey && revealedSelection.current !== selectedKey && expandedKeys.has(selectedKey)) {
			const selected = logToggle(rootRef.current, selectedKey);
			if (selected) {
				revealedSelection.current = selectedKey;
				if (document.activeElement === document.body) { selected.focus({ preventScroll: true }); }
				revealExpandedLog(selected);
			}
		}
	}, [expandedKeys, selectedKey, data]);
	const toggle = (key: string) => {
		if (!expandedKeys.has(key)) {
			activeKey.current = key;
			pendingDirection.current = 1;
			pendingFocus.current = logToggle(rootRef.current, key) ?? null;
		} else if (activeKey.current === key) { activeKey.current = undefined; }
		if (!expandedKeys.has(key)) { onInspect(); }
		onExpandedChange(current => {
			const next = new Set(current);
			if (next.has(key)) { next.delete(key); }
			else { next.add(key); }
			return next;
		});
	};

	return (
		<div
			ref={rootRef}
			className="min-w-0 rounded-md border border-border bg-card"
			onFocusCapture={event => {
				const row = (event.target as HTMLElement).closest<HTMLElement>('[data-log-index]');
				if (row) { activeKey.current = rows[Number(row.dataset.logIndex)]?.id; }
			}}
			onKeyDown={event => {
				if (
					event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey
					|| !['ArrowUp', 'ArrowDown'].includes(event.key)
				) { return; }
				const target = event.target as HTMLElement;
				if (
					target.closest(
						'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="menu"], [role="listbox"], [aria-haspopup]',
					)
				) { return; }
				const row = target.closest<HTMLElement>('[data-log-index]');
				const key = row
					? rows[Number(row.dataset.logIndex)]?.id
					: target.dataset.slot === 'table-container'
					? [activeKey.current, selectedKey, ...(expandedKeys.size === 1 ? expandedKeys : [])].find(key =>
						key && expandedKeys.has(key)
					)
					: undefined;
				if (!key || !expandedKeys.has(key)) { return; }
				event.preventDefault();
				const next = rows[rows.findIndex(row => row.id === key) + (event.key === 'ArrowDown' ? 1 : -1)];
				if (!next) { return; }
				onInspect();
				activeKey.current = next.id;
				pendingDirection.current = event.key === 'ArrowUp' ? -1 : 1;
				pendingFocus.current = logToggle(rootRef.current, next.id) ?? null;
				onExpandedChange(current => {
					const result = new Set(current);
					result.delete(key);
					result.add(next.id);
					return result;
				});
			}}
		>
			<div className="flex items-center justify-between border-b border-border px-3 py-1">
				<span className="text-xs text-muted-foreground">
					{reversed ? 'Oldest first' : 'Newest first'}
				</span>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="ghost" size="sm">
							<Columns3Icon />Columns
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						{table.getAllLeafColumns().filter(column => column.getCanHide()).map(column => (
							<DropdownMenuCheckboxItem
								key={column.id}
								checked={column.getIsVisible()}
								onSelect={event => event.preventDefault()}
								onCheckedChange={value => column.toggleVisibility(!!value)}
							>
								{String(column.columnDef.header)}
							</DropdownMenuCheckboxItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
			<Table
				containerRef={containerRef}
				containerTabIndex={0}
				className="table-fixed text-xs"
				style={{ width: `max(100%, ${table.getTotalSize()}px)` }}
				containerClassName="logsTable h-[calc(100dvh-18rem-var(--notification-banner-height,0px))] min-h-64 overflow-auto rounded-b-md [overflow-anchor:none]"
			>
				<colgroup>
					{table.getVisibleLeafColumns().map(column => <col key={column.id} style={{ width: column.getSize() }} />)}
				</colgroup>
				<TableHeader className="sticky top-0 z-10 bg-card">
					{table.getHeaderGroups().map(group => (
						<TableRow key={group.id}>
							{group.headers.map(header =>
								header.column.id === 'timestamp'
									? (
										<TableHeadSortable
											key={header.id}
											header={header}
											className="px-2"
											aria-label="Timestamp"
											aria-sort={reversed ? 'ascending' : 'descending'}
										>
											<Button
												size="sm"
												variant="ghost"
												onClick={onReverse}
												aria-label={reversed ? 'Sort newest first' : 'Sort oldest first'}
											>
												Timestamp{reversed ? <ArrowUpIcon /> : <ArrowDownIcon />}
											</Button>
										</TableHeadSortable>
									)
									: <TableHeadSortable key={header.id} header={header} className="bg-card" />
							)}
						</TableRow>
					))}
				</TableHeader>
				<TableBody>
					{rows.map((row, index) => {
						const eventKey = logKey(row.original);
						const open = expandedKeys.has(eventKey);
						const detailId = `${id}-detail-${index}`;
						return (
							<Fragment key={row.id}>
								<TableRow
									data-log-index={index}
									data-log-selected={selectedKey === row.id ? true : undefined}
									data-state={open ? 'selected' : undefined}
									className={cn(
										'cursor-pointer hover:bg-muted/30',
										open && 'bg-muted/30',
										selectedKey === row.id && 'outline outline-primary -outline-offset-1',
									)}
									onClick={event => {
										if (
											(event.target as HTMLElement).closest('button, a, input') || window.getSelection()?.toString()
										) { return; }
										toggle(eventKey);
										logToggle(rootRef.current, eventKey)?.focus({ preventScroll: true });
									}}
								>
									{row.getVisibleCells().map(cell => (
										<TableCell key={cell.id} data-col-id={cell.column.id} className="overflow-hidden px-2 py-2.5">
											{cell.column.id === 'expand'
												? (
													<button
														type="button"
														className="flex size-6 items-center justify-center rounded hover:bg-muted focus-visible:outline-2"
														aria-label={`${open ? 'Collapse' : 'Expand'} log ${index + 1}`}
														aria-expanded={open}
														data-log-toggle={eventKey}
														aria-keyshortcuts={open ? 'ArrowUp ArrowDown' : undefined}
														aria-controls={open ? detailId : undefined}
														onClick={event => {
															toggle(eventKey);
															event.currentTarget.focus({ preventScroll: true });
														}}
													>
														<ChevronRightIcon className={cn('size-4 transition-transform', open && 'rotate-90')} />
													</button>
												)
												: <LogCellContent cell={cell} />}
										</TableCell>
									))}
								</TableRow>
								{open && (
									<TableRow id={detailId} data-log-index={index}>
										<TableCell colSpan={row.getVisibleCells().length} className="whitespace-normal p-0">
											<LogDetails log={row.original} source={source} />
										</TableCell>
									</TableRow>
								)}
							</Fragment>
						);
					})}
					{data.length === 0 && (
						<TableRow>
							<TableCell
								colSpan={table.getVisibleLeafColumns().length}
								className="h-32 text-center text-muted-foreground"
							>
								No logs match this view. Try widening the time range or clearing filters.
							</TableCell>
						</TableRow>
					)}
				</TableBody>
			</Table>
		</div>
	);
});
