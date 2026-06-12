import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { renderBadgeLogLevelVariant } from '@/components/ui/utils/badgeLogLevel';
import { BadgeNodeVariantValues, memoizeNodeNames } from '@/components/ui/utils/badgeNode';
import { isLocalStudio } from '@/config/constants';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { LogsDataTable } from '@/features/instance/log/LogsDataTable';
import { ViewLogModal } from '@/features/instance/log/modals/ViewLogModal';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useRefreshClick } from '@/hooks/useRefreshClick';
import { getReadLogQueryOptions, ReadLogItem } from '@/integrations/api/instance/status/getReadLog';
import { getRegistrationInfoQueryOptions } from '@/integrations/api/instance/status/getRegistrationInfo';
import { LogFiltersFormSchema } from '@/integrations/api/instance/status/logFiltersFormSchema';
import { LocalStorageKeys } from '@/lib/storage/localStorageKeys';
import { capitalizeWords } from '@/lib/string/capitalizeWords';
import { wasAReleasedBeforeB } from '@/lib/string/wasAReleasedBeforeB';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { ColumnDef } from '@tanstack/react-table';
import {
	ActivityIcon,
	AlertCircleIcon,
	AlertTriangleIcon,
	ArrowUpDownIcon,
	BellIcon,
	BugIcon,
	InfoIcon,
	RefreshCwIcon,
	SlidersHorizontalIcon,
	TerminalIcon,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { LogsFiltersForm } from './components/LogsFiltersForm';

type RowData = {
	original: ReadLogItem;
};

const defaultFormValues: z.infer<typeof LogFiltersFormSchema> = {
	log_name: 'hdb.log',
	limit: '100',
	level: 'undefined',
	from: '',
	until: '',
	filter: '',
};

const levelIcons: Record<ReadLogItem['level'], React.ReactNode> = {
	error: <AlertCircleIcon className="size-3" />,
	stderr: <AlertCircleIcon className="size-3" />,
	warn: <AlertTriangleIcon className="size-3" />,
	notify: <BellIcon className="size-3" />,
	info: <InfoIcon className="size-3" />,
	debug: <BugIcon className="size-3" />,
	trace: <ActivityIcon className="size-3" />,
	stdout: <TerminalIcon className="size-3" />,
};

const columns: ColumnDef<ReadLogItem>[] = [
	{
		accessorKey: 'level',
		header: 'Level',
		cell: ({ row }) => {
			const { level } = row.original;
			return (
				<Badge variant={renderBadgeLogLevelVariant(level)}>
					{levelIcons[level]}
					{capitalizeWords(level)}
				</Badge>
			);
		},
	},
	{
		accessorKey: 'timestamp',
		header: 'Timestamp',
		cell: ({ row }) => {
			const { timestamp } = row.original;
			const date = new Date(timestamp);
			const sameYear = date.getFullYear() === new Date().getFullYear();
			const dateStr = sameYear
				? date.toLocaleDateString(undefined, { month: 'numeric', day: '2-digit' })
				: date.toLocaleDateString();
			return (
				<span className="tabular-nums whitespace-nowrap text-muted-foreground">
					{dateStr} {date.toLocaleTimeString()}
				</span>
			);
		},
	},
	{
		accessorKey: 'message',
		header: 'Message',
		cell: ({ row }) => {
			const { message } = row.original;
			return (
				<span className="block max-w-xl truncate font-mono text-xs">
					{message}
				</span>
			);
		},
	},
	{
		accessorKey: 'thread',
		header: 'Thread',
		cell: ({ row }) => <span className="text-muted-foreground tabular-nums">{row.original.thread}</span>,
	},
	{
		accessorKey: 'node',
		header: 'Node',
		cell: ({ row }) => {
			const { node } = row.original;
			const variant: BadgeNodeVariantValues = memoizeNodeNames(node);
			return (
				<>
					{node
						? (
							<Tooltip>
								<TooltipTrigger asChild>
									<Badge variant={variant}>{node.split('.')[0]}...</Badge>
								</TooltipTrigger>
								<TooltipContent
									className="bg-popover text-popover-foreground border border-border"
									arrowClassName="bg-popover fill-popover"
								>
									{node}
								</TooltipContent>
							</Tooltip>
						)
						: null}
				</>
			);
		},
	},
	{
		accessorKey: 'tags',
		header: 'Tags',
		cell: ({ row }) => {
			const { tags } = row.original;
			return tags && tags.length > 0
				? <span className="text-muted-foreground text-xs">{tags}</span>
				: null;
		},
	},
];

const isValidDateRange = (startDate?: string | null, endDate?: string | null) => {
	if (!startDate && !endDate) { return true; }
	if (!startDate || !endDate) { return true; }

	const start = new Date(startDate);
	const end = new Date(endDate);
	return start <= end;
};

function LogsTableSkeleton() {
	return (
		<div className="rounded-md bg-card dark:bg-black-dark overflow-hidden">
			<div className="flex gap-4 p-4 border-b border-border">
				{['w-14', 'w-32', 'w-14', 'w-24', 'w-16', 'flex-1'].map((w, i) => <Skeleton key={i} className={`h-4 ${w}`} />)}
			</div>
			{Array.from({ length: 12 }).map((_, i) => (
				<div key={i} className="flex gap-4 p-3 border-b border-border/40 border-l-2 border-l-transparent">
					<Skeleton className="h-5 w-14" />
					<Skeleton className="h-5 w-32" />
					<Skeleton className="h-5 w-10" />
					<Skeleton className="h-5 w-20" />
					<Skeleton className="h-5 w-12" />
					<Skeleton className="h-5 flex-1 max-w-xs" />
				</div>
			))}
		</div>
	);
}

export function Logs() {
	const [logFilters, setLogFilters] = useState<z.infer<typeof LogFiltersFormSchema>>(defaultFormValues);

	const [isViewLogModalOpen, setIsViewLogModalOpen] = useState(false);
	const [selectedLogData, setSelectedLogData] = useState<ReadLogItem | undefined>();
	const [isAutoRefreshEnabled, setIsAutoRefreshEnabled] = useState(false);
	// Persisted per browser/user across all clusters and instances; defaults to newest-first.
	const [isReversed, setIsReversed] = useLocalStorage<boolean>(LocalStorageKeys.LogsOrderReversed, false);
	const [isFiltersOpen, setIsFiltersOpen] = useState(false);

	const instanceParams = useInstanceClientIdParams();

	const { data: registrationInfo } = useQuery(getRegistrationInfoQueryOptions(instanceParams));
	const version = registrationInfo?.version;
	const showLogName = !isLocalStudio && !!version && wasAReleasedBeforeB('5.0.13', version);
	const showFilter = !!version && wasAReleasedBeforeB('4.7.16', version);

	const {
		data: instanceLogs,
		isLoading,
		refetch: refetchReadLogQueryOptions,
		isFetching: isFetchingInstanceLogs,
	} = useQuery(
		getReadLogQueryOptions({
			logFilters,
			...instanceParams,
			replicated: instanceParams.entityType === 'cluster',
			isAutoRefreshEnabled,
		}),
	);

	// Logs arrive newest-first from the API; reversing flips the view to oldest-first without re-fetching.
	const displayedLogs = useMemo(
		() => (isReversed ? [...(instanceLogs ?? [])].reverse() : instanceLogs ?? []),
		[instanceLogs, isReversed],
	);

	const tableScrollRef = useRef<HTMLDivElement>(null);

	// Keep the newest entries in view on first load and whenever the display order changes: the table
	// scrolls to the top when newest-first, and to the bottom when newest-last (the log-file style).
	useEffect(() => {
		const el = tableScrollRef.current;
		if (isLoading || !el) { return; }
		el.scrollTo({ top: isReversed ? el.scrollHeight : 0 });
	}, [isReversed, isLoading]);

	// While auto-refreshing, follow new entries like `tail -f`, keeping the newest in view as they arrive.
	useEffect(() => {
		const el = tableScrollRef.current;
		if (!isAutoRefreshEnabled || isLoading || !el) { return; }
		el.scrollTo({ top: isReversed ? el.scrollHeight : 0 });
	}, [displayedLogs, isAutoRefreshEnabled, isReversed, isLoading]);

	const form = useForm({
		resolver: zodResolver(LogFiltersFormSchema),
		defaultValues: defaultFormValues,
		mode: 'onChange',
	});

	const onRowClick = (rowData: RowData): void => {
		setSelectedLogData(rowData.original);
		setIsViewLogModalOpen(true);
	};

	const submitFilters = async (data: z.infer<typeof LogFiltersFormSchema>) => {
		if (!isValidDateRange(data.from, data.until)) {
			form.setError('from', {
				type: 'onChange',
				message: 'Start date must be before end date',
			});
			form.setError('until', {
				type: 'onChange',
				message: 'End date must be after start date',
			});
			return;
		}
		setLogFilters(data);
	};

	const resetFilters = async () => {
		form.reset();
		setLogFilters(defaultFormValues);
	};

	const onRefreshClick = useRefreshClick(refetchReadLogQueryOptions);

	return (
		<div className="grid grid-cols-1 gap-3 pt-2 text-foreground md:grid-cols-12 md:gap-4">
			<section className="col-span-1 md:col-span-4 lg:col-span-3 px-2 pb-0 md:self-start md:sticky md:top-34 md:max-h-[calc(100vh-(--spacing(34)))] md:overflow-y-auto md:pb-4">
				{/* Compact toolbar — mobile only */}
				<div className="flex items-center gap-2 md:hidden">
					<Button
						variant="defaultOutline"
						onClick={() => setIsFiltersOpen((open) => !open)}
						aria-label="Toggle filters"
						aria-expanded={isFiltersOpen}
						className="flex-1"
					>
						<SlidersHorizontalIcon />
						Filters
					</Button>
					<Button
						variant="defaultOutline"
						onClick={onRefreshClick}
						disabled={isFetchingInstanceLogs || isLoading || isAutoRefreshEnabled}
						aria-label="Refresh logs"
						className="flex-1"
					>
						<RefreshCwIcon className={isFetchingInstanceLogs ? 'animate-spin' : ''} />
						Refresh
					</Button>
					<Button
						variant={isReversed ? 'default' : 'defaultOutline'}
						onClick={() => setIsReversed((reversed) => !reversed)}
						aria-label="Reverse log order"
						aria-pressed={isReversed}
						className="flex-1"
					>
						<ArrowUpDownIcon />
						Reverse
					</Button>
				</div>

				<LogsFiltersForm
					form={form}
					resetFilters={resetFilters}
					submitFilters={submitFilters}
					showLogName={showLogName}
					showFilter={showFilter}
					isOpen={isFiltersOpen}
					onOpenChange={setIsFiltersOpen}
				/>

				{/* Full controls — desktop only */}
				<div className="mt-3 space-y-3 hidden md:block">
					<Button
						variant="defaultOutline"
						onClick={onRefreshClick}
						disabled={isFetchingInstanceLogs || isLoading || isAutoRefreshEnabled}
						className="w-full"
					>
						<RefreshCwIcon />
						Refresh
					</Button>
					<div className="flex flex-col gap-2.5">
						<div className="flex items-center gap-2 text-sm text-foreground">
							<Switch
								id="logs-auto-refresh-switch"
								aria-label="Toggle auto refresh"
								checked={isAutoRefreshEnabled}
								onCheckedChange={setIsAutoRefreshEnabled}
							/>
							<label htmlFor="logs-auto-refresh-switch" className="flex items-center gap-2 cursor-pointer">
								<RefreshCwIcon
									className={`size-4 ${isAutoRefreshEnabled ? 'animate-spin [animation-duration:3s]' : ''}`}
								/>
								Auto refresh (every 5s)
							</label>
						</div>
						<div className="flex items-center gap-2 text-sm text-foreground">
							<Switch
								id="logs-reverse-order-switch"
								aria-label="Reverse log order"
								checked={isReversed}
								onCheckedChange={setIsReversed}
							/>
							<label htmlFor="logs-reverse-order-switch" className="flex items-center gap-2 cursor-pointer">
								<ArrowUpDownIcon className="size-4" />
								{isReversed ? 'Oldest first' : 'Newest first'}
							</label>
						</div>
					</div>
				</div>
			</section>
			<section className="col-span-1 md:col-span-8 lg:col-span-9">
				{isLoading
					? <LogsTableSkeleton />
					: (
						<LogsDataTable
							columns={columns}
							data={displayedLogs}
							onRowClick={onRowClick}
							containerRef={tableScrollRef}
						/>
					)}
			</section>
			<ViewLogModal isModalOpen={isViewLogModalOpen} setIsModalOpen={setIsViewLogModalOpen} data={selectedLogData} />
		</div>
	);
}
