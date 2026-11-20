import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { isLocalStudio } from '@/config/constants';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { LogContextLimitError, ReadLogItem } from '@/integrations/api/instance/status/getReadLog';
import { getRegistrationInfoQueryOptions } from '@/integrations/api/instance/status/getRegistrationInfo';
import {
	getLogDateError,
	logDateForValue,
	LogFiltersFormSchema,
} from '@/integrations/api/instance/status/logFiltersFormSchema';
import { LocalStorageKeys } from '@/lib/storage/localStorageKeys';
import { wasAReleasedBeforeB } from '@/lib/string/wasAReleasedBeforeB';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { useSearch } from '@tanstack/react-router';
import { ChevronDownIcon, RefreshCwIcon, SearchIcon, SlidersHorizontalIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { DownloadLogsMenu } from './components/DownloadLogsMenu';
import { LogsFiltersForm } from './components/LogsFiltersForm';
import { logKey } from './hooks/mergeReadLogs';
import { useInstanceLogs } from './hooks/useInstanceLogs';
import { useLogViewport } from './hooks/useLogViewport';
import { LogsDataTable } from './LogsDataTable';
import {
	DEFAULT_LOG_FILTERS,
	localDateTime,
	LogFilters,
	logMatchesTarget,
	parseLogTarget,
	surroundingFilters,
	TimeRange,
	validDateRange,
	withTimeRange,
} from './logView';

const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

type InstanceParams = ReturnType<typeof useInstanceClientIdParams>;

function formDates(filters: LogFilters): LogFilters {
	return {
		...filters,
		from: filters.from ? localDateTime(new Date(filters.from)) : '',
		until: filters.until ? localDateTime(new Date(filters.until)) : '',
	};
}

function Facet({ label, field, logs, value, onChange }: {
	label: string;
	field: 'node' | 'thread';
	logs: ReadLogItem[];
	value: string;
	onChange: (value: string) => void;
}) {
	const counts = useMemo(() => {
		const result = new Map<string, number>();
		for (const log of logs) {
			const key = log[field] || '';
			result.set(key, (result.get(key) ?? 0) + 1);
		}
		return [...result].sort(([a], [b]) => a.localeCompare(b));
	}, [logs, field]);
	return (
		<label className="block space-y-1 text-sm">
			<span>{label}</span>
			<select
				className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
				value={value}
				onChange={event => onChange(event.target.value)}
			>
				<option value="*">All ({logs.length})</option>
				{value !== '*' && !counts.some(([key]) => key === value) && (
					<option value={value}>{value || 'Local'} (0)</option>
				)}
				{counts.map(([key, count]) => <option key={key} value={key}>{key || 'Local'} ({count})</option>)}
			</select>
		</label>
	);
}

export function Logs() {
	const params = useInstanceClientIdParams();
	const target = useSearch({ strict: false, select: search => parseLogTarget(search.log) });
	const search = target ? new URLSearchParams({ log: JSON.stringify(target) }).toString() : '';
	return <LogsExplorer key={`${params.entityId}:${search}`} params={params} search={search} />;
}

export function LogsExplorer({ params, search = '' }: { params: InstanceParams; search?: string }) {
	const [target, setTarget] = useState(() => parseLogTarget(new URLSearchParams(search).get('log')));
	const [initialFilters] = useState(() =>
		target
			? surroundingFilters({ ...DEFAULT_LOG_FILTERS, log_name: target.source }, target.timestamp)
			: withTimeRange(DEFAULT_LOG_FILTERS, '15')
	);
	const [logFilters, setLogFilters] = useState(initialFilters);
	const [range, setRange] = useState<TimeRange>(target ? 'custom' : '15');
	const [isLive, setIsLive] = useState(false);
	const [isReversed, setIsReversed] = useLocalStorage<boolean>(LocalStorageKeys.LogsOrderReversed, false);
	const [isFiltersOpen, setIsFiltersOpen] = useState(false);
	const [node, setNode] = useState(target?.node ?? '*');
	const [thread, setThread] = useState('*');
	const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => new Set());
	const linkedSelectionApplied = useRef(false);
	const formSchema = useMemo(() => {
		const current = formDates(logFilters);
		return LogFiltersFormSchema.extend({ from: logDateForValue(current.from), until: logDateForValue(current.until) });
	}, [logFilters.from, logFilters.until]);
	const form = useForm<LogFilters>({
		resolver: zodResolver(formSchema),
		defaultValues: formDates(initialFilters),
		mode: 'onChange',
	});
	const { data: registrationInfo } = useQuery(getRegistrationInfoQueryOptions(params));
	const version = registrationInfo?.version;
	const showLogName = !isLocalStudio && !!version && wasAReleasedBeforeB('5.0.13', version);
	const showFilter = !!version && wasAReleasedBeforeB('4.7.16', version);
	const contextTimestamp = target?.timestamp;
	const { logs: incoming, isLoading, isFetching, refetch, transport, error } = useInstanceLogs({
		params,
		logFilters,
		replicated: params.entityType === 'cluster',
		live: isLive,
		contextTimestamp,
	});
	const queryKey = JSON.stringify([params.entityId, logFilters, contextTimestamp]);
	const view = useLogViewport({
		incoming,
		queryKey,
		expandedKeys,
		reversed: isReversed,
		node,
		thread,
		loading: isLoading,
	});
	const baseLogs = view.logs;
	const displayedLogs = view.displayedLogs;
	const targetMatches = useMemo(() => target ? incoming.filter(log => logMatchesTarget(log, target)) : [], [
		incoming,
		target,
	]);
	const selectedKey = targetMatches.length === 1 ? logKey(targetMatches[0]) : undefined;
	useEffect(() => {
		if (isLoading) { return; }
		setExpandedKeys(current => {
			if (!current.size) { return current; }
			const present = new Set(baseLogs.map(logKey));
			return [...current].every(key => present.has(key))
				? current
				: new Set([...current].filter(key => present.has(key)));
		});
	}, [baseLogs, isLoading]);
	useEffect(() => {
		if (!target || targetMatches.length !== 1 || linkedSelectionApplied.current) { return; }
		linkedSelectionApplied.current = true;
		setExpandedKeys(current => new Set([...current, logKey(targetMatches[0])]));
		view.onInspect();
	}, [target, targetMatches, view.onInspect]);

	const apply = (data: LogFilters, nextRange?: TimeRange) => {
		const displayed = formDates(logFilters);
		const requestedRange = nextRange
			?? (data.from !== displayed.from || data.until !== displayed.until ? 'custom' : range);
		const canonical = {
			...data,
			from: data.from === displayed.from ? logFilters.from : data.from,
			until: data.until === displayed.until ? logFilters.until : data.until,
		};
		const next = withTimeRange(canonical, requestedRange);
		if (requestedRange === 'custom') {
			for (const field of ['from', 'until'] as const) {
				const message = data[field] !== displayed[field] ? getLogDateError(data[field]) : undefined;
				if (message) {
					form.setError(field, { message });
					setIsFiltersOpen(true);
					return;
				}
			}
		}
		if (!validDateRange(next.from, next.until)) {
			form.setError('from', { message: 'Choose valid dates with the start before the end.' });
			setIsFiltersOpen(true);
			return;
		}
		if (next.until) { setIsLive(false); }
		setRange(requestedRange);
		form.reset(formDates(next));
		setLogFilters(next);
		setTarget(undefined);
		setExpandedKeys(new Set());
	};
	const refresh = () => {
		void refetch();
	};

	const reset = () => {
		setRange('latest');
		setNode('*');
		setThread('*');
		apply(DEFAULT_LOG_FILTERS, 'latest');
	};

	const reverse = useCallback(() => setIsReversed(value => !value), [setIsReversed]);

	return (
		<div className="space-y-3 px-2 pt-3 text-foreground">
			<div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card p-3">
				<Button
					variant="defaultOutline"
					size="default"
					className="shrink-0 rounded-md"
					onClick={() => setIsFiltersOpen(open => !open)}
					aria-expanded={isFiltersOpen}
					aria-controls={isFiltersOpen ? 'logs-sidebar' : undefined}
				>
					<SlidersHorizontalIcon />Filters
				</Button>
				{showFilter && (
					<form
						className="flex min-w-48 flex-1 gap-2"
						onSubmit={form.handleSubmit(data => apply(data), () => setIsFiltersOpen(true))}
					>
						<div className="relative flex-1">
							<SearchIcon className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
							<Input
								type="search"
								aria-label="Search logs"
								placeholder="Search logs…"
								className="pl-9"
								{...form.register('filter')}
							/>
						</div>
						<Button type="submit" size="default" variant="defaultOutline" className="rounded-md">Search</Button>
					</form>
				)}
				<div className="relative shrink-0">
					<select
						aria-label="Time range"
						value={range}
						className="h-9 appearance-none rounded-md border border-input bg-background pl-3 pr-9 text-sm"
						onChange={event => {
							const value = event.target.value as TimeRange;
							setRange(value);
							if (value === 'custom') { setIsFiltersOpen(true); }
							else {
								const draft = form.getValues();
								apply(formDates(logFilters), value);
								for (const field of ['filter', 'limit', 'level', 'log_name'] as const) {
									form.setValue(field, draft[field]);
								}
							}
						}}
					>
						<option value="15">Last 15 minutes</option>
						<option value="60">Last hour</option>
						<option value="1440">Last 24 hours</option>
						<option value="latest">Latest (any time)</option>
						<option value="custom">Custom range</option>
					</select>
					<ChevronDownIcon
						aria-hidden="true"
						className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
					/>
				</div>
				<Button
					size="default"
					variant="ghost"
					aria-label="Refresh logs"
					className="shrink-0 rounded-md"
					onClick={refresh}
					disabled={isFetching || isLoading}
				>
					<RefreshCwIcon className={isFetching ? 'animate-spin' : ''} />Refresh
				</Button>
				<DownloadLogsMenu className="rounded-md" logs={displayedLogs} logName={logFilters.log_name ?? 'hdb.log'} />
				<div className="flex h-9 shrink-0 items-center gap-2 border-l border-border pl-3 text-sm">
					<Switch
						id="logs-live"
						aria-label="Live logs"
						checked={isLive}
						disabled={!!logFilters.until}
						onCheckedChange={value => {
							setIsLive(value);
						}}
					/>
					<label htmlFor="logs-live">Live</label>
				</div>
			</div>
			<div
				className="flex min-h-8 flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"
				aria-live="polite"
			>
				<span>
					{isLoading ? 'Loading logs…' : `${displayedLogs.length} loaded logs`} · {timezone} ·{' '}
					{logFilters.log_name ?? 'hdb.log'}
					{isLive && ` · ${transport === 'streaming' ? 'Streaming' : 'Updating every 5s'}`}
					{!!logFilters.until && ' · Fixed time range (Live unavailable)'}
				</span>
				{view.away && <Button size="sm" variant="defaultOutline" onClick={view.jumpToLatest}>Jump to latest</Button>}
			</div>
			{!!error && (
				<div role="alert" className="flex items-center gap-3 rounded-md border border-destructive p-3 text-sm">
					{error instanceof LogContextLimitError
						? (
							<>
								{error.message}
								<Button
									aria-label="Open context filters"
									size="sm"
									variant="defaultOutline"
									onClick={() => setIsFiltersOpen(true)}
								>
									Filters
								</Button>
							</>
						)
						: (
							<>
								Could not load logs. <Button size="sm" variant="defaultOutline" onClick={refresh}>Retry</Button>
							</>
						)}
				</div>
			)}

			{target && !isLoading && !error && targetMatches.length !== 1 && (
				<p role="status" className="text-sm text-muted-foreground">
					{targetMatches.length > 1
						? 'Multiple logs match this link. Expand an entry to inspect it.'
						: 'The linked log was not found in this loaded window. It may have expired or been excluded by the result limit.'}
				</p>
			)}
			<div className="flex flex-col gap-3 md:flex-row">
				{isFiltersOpen && (
					<aside id="logs-sidebar" className="w-full shrink-0 space-y-3 md:w-64">
						<div className="space-y-3 rounded-md border border-border bg-card p-4">
							<p className="text-xs text-muted-foreground">Filter loaded results</p>
							<Facet label="Node" field="node" logs={baseLogs} value={node} onChange={setNode} />
							<Facet label="Thread" field="thread" logs={baseLogs} value={thread} onChange={setThread} />
						</div>
						<LogsFiltersForm
							form={form}
							dateMaxValues={formDates(logFilters)}
							resetFilters={reset}
							submitFilters={data => apply(data)}
							showLogName={showLogName}
							showFilter={false}
							isOpen={isFiltersOpen}
							onOpenChange={setIsFiltersOpen}
						/>
					</aside>
				)}
				<section
					className="min-w-0 flex-1"
					aria-label="Log results"
					onScrollCapture={event => {
						if (event.target === view.containerRef.current) { view.onScroll(); }
					}}
					onPointerDownCapture={event => {
						if (event.target === view.containerRef.current) { view.onScrollIntent(); }
					}}
					onWheelCapture={view.onWheel}
					onTouchMoveCapture={view.onScrollIntent}
					onKeyDown={event => {
						if (
							!event.defaultPrevented && !event.altKey && !event.ctrlKey && !event.metaKey
							&& !(event.target as HTMLElement).closest('input, textarea, select, [contenteditable], [role=menu]')
							&& ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)
						) { view.onScrollIntent(); }
					}}
				>
					<LogsDataTable
						data={isLoading ? [] : displayedLogs}
						expandedKeys={expandedKeys}
						onExpandedChange={setExpandedKeys}
						source={logFilters.log_name}
						containerRef={view.containerRef}
						reversed={isReversed}
						onReverse={reverse}
						selectedKey={selectedKey}
						onInspect={view.onInspect}
					/>
				</section>
			</div>
		</div>
	);
}
