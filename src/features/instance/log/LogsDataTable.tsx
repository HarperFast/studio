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
import { ColumnDef, studioTableFeatures } from '@/lib/table';
import { ColumnSizingState, ColumnVisibilityState, flexRender, useTable } from '@tanstack/react-table';
import { ArrowDownIcon, ArrowUpIcon, ChevronRightIcon, Columns3Icon } from 'lucide-react';
import { Fragment, memo, Ref, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
					'inline-flex items-center gap-2 capitalize',
					['error', 'stderr'].includes(row.original.level)
						? 'text-destructive'
						: row.original.level === 'warn'
						? 'text-yellow-600 dark:text-yellow-400'
						: 'text-muted-foreground',
				)}
			>
				<span className="size-1.5 rounded-full bg-current" />
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
		cell: ({ row }) => <span className="block truncate font-mono">{row.original.message}</span>,
	},
	{ accessorKey: 'thread', header: 'Thread', size: 100 },
	{
		accessorKey: 'node',
		header: 'Node',
		size: 200,
		cell: ({ row }) => (
			<span className="block truncate text-muted-foreground" title={row.original.node}>
				{row.original.node || 'Local'}
			</span>
		),
	},
	{ accessorKey: 'tags', header: 'Tags', size: 160, cell: ({ row }) => row.original.tags?.join(', ') },
];

export const LogsDataTable = memo(function LogsDataTable(
	{ data, source, onInspect, onViewContext, containerRef, reversed, onReverse, selectedKey }: {
		data: ReadLogItem[];
		source: LogFilters['log_name'];
		onInspect: () => void;
		onViewContext: (log: ReadLogItem) => void;
		containerRef?: Ref<HTMLDivElement>;
		reversed: boolean;
		onReverse: () => void;
		selectedKey?: string;
	},
) {
	const [expanded, setExpanded] = useState<Set<string>>(() => new Set<string>());
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
	// TanStack includes row IDs in cell IDs; keep them short while matching complete log identities.
	const previousIds = useRef(new Map<string, string>());
	const nextId = useRef(0);
	const rowIds = useMemo(() => {
		const result = new Map<string, string>();
		for (const log of data) {
			const key = logKey(log);
			result.set(key, previousIds.current.get(key) ?? `log-${++nextId.current}`);
		}
		return result;
	}, [data]);
	useLayoutEffect(() => {
		previousIds.current = rowIds;
	}, [rowIds]);
	const selectionId = selectedKey ? rowIds.get(selectedKey) : undefined;
	const id = useId();
	const appliedSelection = useRef<string | undefined>(undefined);
	const table = useTable({
		features: studioTableFeatures,
		data,
		columns,
		getRowId: log => rowIds.get(logKey(log))!,
		manualSorting: true,
		enableColumnResizing: true,
		columnResizeMode: 'onEnd',
		defaultColumn: { minSize: 70 },
		state: { columnSizing, columnVisibility },
		onColumnSizingChange: value => setStoredSizing(typeof value === 'function' ? value(columnSizing) : value),
		onColumnVisibilityChange: value =>
			setStoredVisibility(typeof value === 'function' ? value(columnVisibility) : value),
	});
	const keys = useMemo(() => new Set(rowIds.values()), [rowIds]);
	useEffect(() => {
		const selectionToAdd = selectionId && selectionId !== appliedSelection.current
			? selectionId
			: undefined;
		setExpanded(current => {
			const next = new Set([...current].filter(key => keys.has(key)));
			if (selectionToAdd) { next.add(selectionToAdd); }
			return next.size === current.size && [...next].every(key => current.has(key)) ? current : next;
		});
		if (selectionToAdd) {
			appliedSelection.current = selectionToAdd;
			onInspect();
		}
		if (!selectedKey) { appliedSelection.current = undefined; }
	}, [keys, selectedKey, selectionId, onInspect]);

	const toggle = (key: string) => {
		if (!expanded.has(key)) { onInspect(); }
		setExpanded(current => {
			const next = new Set(current);
			if (next.has(key)) { next.delete(key); }
			else { next.add(key); }
			return next;
		});
	};
	return (
		<div className="min-w-0 rounded-md border border-border bg-card">
			<div className="flex items-center justify-between border-b border-border px-3 py-1">
				<span className="text-xs text-muted-foreground">
					{data.length} loaded logs · {reversed ? 'Oldest first' : 'Newest first'}
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
				containerClassName="logsTable max-h-[calc(100dvh-18rem-var(--notification-banner-height,0px))] min-h-64 overflow-auto rounded-b-md"
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
					{table.getRowModel().rows.map((row, index) => {
						const open = expanded.has(row.id);
						const detailId = `${id}-detail-${index}`;
						return (
							<Fragment key={row.id}>
								<TableRow
									data-log-selected={selectionId === row.id ? true : undefined}
									data-state={open ? 'selected' : undefined}
									className={cn(
										'cursor-pointer hover:bg-muted/30',
										open && 'bg-muted/30',
										selectionId === row.id && 'outline outline-primary -outline-offset-1',
									)}
									onClick={event => {
										if (
											(event.target as HTMLElement).closest('button, a, input') || window.getSelection()?.toString()
										) { return; }
										toggle(row.id);
									}}
								>
									{row.getVisibleCells().map(cell => (
										<TableCell key={cell.id} className="overflow-hidden px-2 py-2.5">
											{cell.column.id === 'expand'
												? (
													<button
														type="button"
														className="flex size-6 items-center justify-center rounded hover:bg-muted focus-visible:outline-2"
														aria-label={`${open ? 'Collapse' : 'Expand'} log ${index + 1}`}
														aria-expanded={open}
														aria-controls={open ? detailId : undefined}
														onClick={() => toggle(row.id)}
													>
														<ChevronRightIcon className={cn('size-4 transition-transform', open && 'rotate-90')} />
													</button>
												)
												: flexRender(cell.column.columnDef.cell, cell.getContext())}
										</TableCell>
									))}
								</TableRow>
								{open && (
									<TableRow id={detailId}>
										<TableCell colSpan={row.getVisibleCells().length} className="whitespace-normal p-0">
											<LogDetails log={row.original} source={source} onViewContext={onViewContext} />
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
