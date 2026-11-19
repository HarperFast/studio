import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { isLocalStudio } from '@/config/constants';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { ReadLogItem } from '@/integrations/api/instance/status/getReadLog';
import { getRegistrationInfoQueryOptions } from '@/integrations/api/instance/status/getRegistrationInfo';
import { LogFiltersFormSchema } from '@/integrations/api/instance/status/logFiltersFormSchema';
import { LocalStorageKeys } from '@/lib/storage/localStorageKeys';
import { wasAReleasedBeforeB } from '@/lib/string/wasAReleasedBeforeB';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from '@tanstack/react-router';
import { ArrowLeftIcon, DownloadIcon, PlayIcon, RefreshCwIcon, SearchIcon, SlidersHorizontalIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { LogsFiltersForm } from './components/LogsFiltersForm';
import { logKey, mergeReadLogs } from './hooks/mergeReadLogs';
import { useInstanceLogs } from './hooks/useInstanceLogs';
import { useLogInspection } from './hooks/useLogInspection';
import { LogsDataTable } from './LogsDataTable';
import {
	DEFAULT_LOG_FILTERS,
	LogFilters,
	logMatchesTarget,
	parseLogTarget,
	surroundingFilters,
	TimeRange,
	validDateRange,
	withTimeRange,
} from './logView';

type InstanceParams = ReturnType<typeof useInstanceClientIdParams>;
type SavedView = {
	filters: LogFilters;
	range: TimeRange;
	node: string;
	thread: string;
	logs: ReadLogItem[];
	live: boolean;
	selected?: string;
};

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
	const search = useLocation({ select: location => location.searchStr });
	return <LogsExplorer key={`${params.entityId}:${search}`} params={params} search={search} />;
}

export function LogsExplorer({ params, search = '' }: { params: InstanceParams; search?: string }) {
	const [target] = useState(() => parseLogTarget(new URLSearchParams(search).get('log')));
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
	const [savedView, setSavedView] = useState<SavedView | null>(null);
	const [contextLog, setContextLog] = useState<ReadLogItem | null>(null);
	const [selected, setSelected] = useState<string>();
	const tableScrollRef = useRef<HTMLDivElement>(null);
	const userScrolling = useRef(false);
	const form = useForm<LogFilters>({
		resolver: zodResolver(LogFiltersFormSchema),
		defaultValues: initialFilters,
		mode: 'onChange',
	});
	const { data: registrationInfo } = useQuery(getRegistrationInfoQueryOptions(params));
	const version = registrationInfo?.version;
	const showLogName = !isLocalStudio && !!version && wasAReleasedBeforeB('5.0.13', version);
	const showFilter = !!version && wasAReleasedBeforeB('4.7.16', version);
	const { logs: incoming, isLoading, isFetching, refetch, transport, error } = useInstanceLogs({
		params,
		logFilters,
		replicated: params.entityType === 'cluster',
		live: isLive,
	});
	const queryKey = JSON.stringify([params.entityId, logFilters]);
	const inspection = useLogInspection(incoming, queryKey);
	const baseLogs = useMemo(() => contextLog ? mergeReadLogs(inspection.logs, [contextLog], 0) : inspection.logs, [
		inspection.logs,
		contextLog,
	]);
	const displayedLogs = useMemo(() => {
		const filtered = baseLogs.filter(log =>
			(node === '*' || (log.node || '') === node) && (thread === '*' || (log.thread || '') === thread)
		);
		return isReversed ? [...filtered].reverse() : filtered;
	}, [baseLogs, node, thread, isReversed]);
	const targetMatches = useMemo(() => target ? incoming.filter(log => logMatchesTarget(log, target)) : [], [
		incoming,
		target,
	]);
	const selectedKey = selected ?? (targetMatches.length === 1 ? logKey(targetMatches[0]) : undefined);
	const following = isLive && !inspection.paused;

	useEffect(() => {
		if (following && !isLoading) {
			const el = tableScrollRef.current;
			el?.scrollTo({ top: isReversed ? el.scrollHeight : 0 });
		}
	}, [displayedLogs, following, isReversed, isLoading]);
	useEffect(() => {
		const el = tableScrollRef.current;
		el?.scrollTo({ top: isReversed ? el.scrollHeight : 0 });
	}, [isReversed]);
	useEffect(() => {
		if (selectedKey && !isLoading) {
			const row = Array.from(tableScrollRef.current?.querySelectorAll<HTMLElement>('[data-log-key]') ?? [])
				.find(element => element.dataset.logKey === selectedKey);
			row?.scrollIntoView?.({ block: 'center' });
		}
	}, [selectedKey, isLoading]);

	const apply = (data: LogFilters, nextRange = range) => {
		const next = withTimeRange(data, nextRange);
		if (!validDateRange(next.from, next.until)) {
			form.setError('from', { message: 'Choose valid dates with the start before the end.' });
			setIsFiltersOpen(true);
			return;
		}
		if (next.until) { setIsLive(false); }
		setRange(nextRange);
		form.reset(next);
		setLogFilters(next);
		inspection.resume();
		setSelected(undefined);
		setSavedView(null);
		setContextLog(null);
	};
	const refresh = () => {
		if (range === 'custom' || range === 'latest') {
			inspection.resume();
			void refetch();
		} else { apply(form.getValues()); }
	};
	const reset = () => {
		setRange('latest');
		setNode('*');
		setThread('*');
		apply(DEFAULT_LOG_FILTERS, 'latest');
	};
	const viewContext = (log: ReadLogItem) => {
		if (!savedView) {
			setSavedView({
				filters: logFilters,
				range,
				node,
				thread,
				logs: inspection.logs,
				live: isLive,
				selected: logKey(log),
			});
		}
		const filters = surroundingFilters(logFilters, log.timestamp);
		setIsLive(false);
		setLogFilters(filters);
		form.reset(filters);
		setRange('custom');
		setNode(log.node || '');
		setThread('*');
		setContextLog(log);
		setSelected(logKey(log));
		inspection.resume();
	};
	const back = () => {
		if (!savedView) { return; }
		setLogFilters(savedView.filters);
		form.reset(savedView.filters);
		setRange(savedView.range);
		setNode(savedView.node);
		setThread(savedView.thread);
		setIsLive(savedView.live);
		setSelected(savedView.selected);
		inspection.restore(savedView.logs, JSON.stringify([params.entityId, savedView.filters]));
		setContextLog(null);
		setSavedView(null);
	};
	const resume = () => {
		setSelected(undefined);
		inspection.resume();
		setIsLive(true);
	};
	const exportLogs = () => {
		const url = URL.createObjectURL(new Blob([JSON.stringify(displayedLogs, null, 2)], { type: 'application/json' }));
		const link = document.createElement('a');
		link.href = url;
		link.download = 'logs.json';
		link.click();
		setTimeout(() => URL.revokeObjectURL(url), 0);
	};
	const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
	return (
		<div className="space-y-3 px-2 pt-3 text-foreground">
			<div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card p-3">
				<Button
					variant="defaultOutline"
					size="sm"
					onClick={() => setIsFiltersOpen(open => !open)}
					aria-expanded={isFiltersOpen}
					aria-controls="logs-sidebar"
				>
					<SlidersHorizontalIcon />Filters
				</Button>
				{showFilter && (
					<form className="flex min-w-48 flex-1 gap-2" onSubmit={form.handleSubmit(data => apply(data))}>
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
						<Button type="submit" size="sm" variant="defaultOutline">Search</Button>
					</form>
				)}
				<select
					aria-label="Time range"
					value={range}
					className="h-9 rounded-md border border-input bg-background px-2 text-sm"
					onChange={event => {
						const value = event.target.value as TimeRange;
						setRange(value);
						if (value === 'custom') { setIsFiltersOpen(true); }
						else { apply(form.getValues(), value); }
					}}
				>
					<option value="15">Last 15 minutes</option>
					<option value="60">Last hour</option>
					<option value="1440">Last 24 hours</option>
					<option value="latest">Latest (any time)</option>
					<option value="custom">Custom range</option>
				</select>
				<Button
					size="sm"
					variant="ghost"
					aria-label="Refresh logs"
					onClick={refresh}
					disabled={isFetching || isLoading}
				>
					<RefreshCwIcon className={isFetching ? 'animate-spin' : ''} />Refresh
				</Button>
				<Button size="sm" variant="ghost" onClick={exportLogs} disabled={!displayedLogs.length}>
					<DownloadIcon />Download
				</Button>
				<div className="flex items-center gap-2 text-sm">
					<Switch
						id="logs-live"
						aria-label="Live logs"
						checked={isLive}
						disabled={!!logFilters.until}
						onCheckedChange={value => {
							setIsLive(value);
							if (value) { inspection.resume(); }
						}}
					/>
					<label htmlFor="logs-live">Live</label>
				</div>
			</div>
			<div
				className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"
				aria-live="polite"
			>
				<span>
					{isLoading ? 'Loading logs…' : `${displayedLogs.length} loaded logs`} · {timezone} ·{' '}
					{logFilters.log_name ?? 'hdb.log'}
					{isLive && !inspection.paused && ` · ${transport === 'streaming' ? 'Streaming' : 'Updating every 5s'}`}
					{!!logFilters.until && ' · Fixed time range (Live unavailable)'}
				</span>
				{inspection.paused && (
					<Button size="sm" variant="defaultOutline" onClick={resume} disabled={!!logFilters.until}>
						<PlayIcon />
						{inspection.pending ? `${inspection.pending} new logs available · ` : ''}Resume live
					</Button>
				)}
			</div>
			{!!error && (
				<div role="alert" className="flex items-center gap-3 rounded-md border border-destructive p-3 text-sm">
					Could not load logs. <Button size="sm" variant="defaultOutline" onClick={refresh}>Retry</Button>
				</div>
			)}
			{savedView && (
				<div className="flex flex-wrap items-center gap-3 rounded-md border border-primary/40 bg-primary/5 p-3 text-sm">
					<Button size="sm" variant="defaultOutline" onClick={back}>
						<ArrowLeftIcon />Back to previous view
					</Button>
					<span>Surrounding logs: ±30 seconds · text and severity filters relaxed · selected node</span>
					<span className="text-xs text-muted-foreground">
						Up to 1,000 logs per response; other nodes may fill the window. The selected event stays visible.
					</span>
				</div>
			)}
			{target && !isLoading && targetMatches.length !== 1 && (
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
							resetFilters={reset}
							submitFilters={data => apply(data, 'custom')}
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
					onWheelCapture={() => {
						userScrolling.current = true;
					}}
					onTouchMoveCapture={() => {
						userScrolling.current = true;
					}}
					onKeyDownCapture={event => {
						if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) {
							userScrolling
								.current = true;
						}
					}}
					onScrollCapture={() => {
						const el = tableScrollRef.current;
						if (!el || !userScrolling.current) { return; }
						userScrolling.current = false;
						const away = isReversed ? el.scrollHeight - el.clientHeight - el.scrollTop > 48 : el.scrollTop > 48;
						if (isLive && away) { inspection.pause(); }
					}}
				>
					<LogsDataTable
						data={isLoading ? [] : displayedLogs}
						source={logFilters.log_name}
						containerRef={tableScrollRef}
						reversed={isReversed}
						onReverse={() => setIsReversed(value => !value)}
						selectedKey={selectedKey}
						onInspect={() => {
							if (isLive) { inspection.pause(); }
						}}
						onViewContext={viewContext}
					/>
				</section>
			</div>
		</div>
	);
}
