import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { InstanceClientIdConfig, InstanceTypeConfig } from '@/config/instanceClientConfig';
import { useInstanceAuth } from '@/hooks/useAuth';
import { getSearchJobsQueryOptions, type JobRecord } from '@/integrations/api/instance/status/searchJobs';
import { cn } from '@/lib/cn';
import { errorText } from '@/lib/errorText';
import { formatDuration } from '@/lib/formatDuration';
import { isForbiddenError } from '@/react-query/pollUnlessForbidden';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { ChevronRightIcon, RefreshCw } from 'lucide-react';
import { Fragment, useState } from 'react';
import { getPreset, REFRESH_OPTIONS, TIME_PRESETS, type TimePresetId } from '../analytics/context/timePresets';
import { PanelErrorBoundary } from '../analytics/tabs/PanelErrorBoundary';
import { PanelStateOrChart } from '../analytics/tabs/PanelShell';
import { validateStatusSearch } from '../statusSearch';
import { canListJobs } from './canListJobs';
import { describeJobStatus, formatJobTime, jobDurationMs } from './jobFormat';

interface Props {
	instanceParams: InstanceClientIdConfig & InstanceTypeConfig;
}

/**
 * `search_jobs_by_start_date` takes no limit, so every poll fetches the whole window: Jobs stops at the
 * 7-day preset rather than re-fetching a month of history, and renders only the newest rows of it.
 */
const JOB_WINDOW_PRESETS = TIME_PRESETS.filter((preset) => preset.durationMs <= getPreset('7d').durationMs);
export const MAX_RENDERED_JOBS = 200;

function jobWindow(range: TimePresetId): TimePresetId {
	return JOB_WINDOW_PRESETS.some((preset) => preset.id === range) ? range : JOB_WINDOW_PRESETS.at(-1)!.id;
}

export function JobsTab({ instanceParams }: Props) {
	const navigate = useNavigate();
	const search = validateStatusSearch(useSearch({ strict: false }) as Record<string, unknown>);
	const { user } = useInstanceAuth(instanceParams.entityId);
	const allowed = canListJobs(user?.role?.permission);
	const range = jobWindow(search.range);
	const windowMs = getPreset(range).durationMs;

	const query = useQuery(getSearchJobsQueryOptions({
		...instanceParams,
		windowMs,
		refreshMs: search.refresh,
		enabled: allowed === true,
	}));

	const setRange = (range: TimePresetId) => void navigate({ to: '.', search: { ...search, range } });
	const setRefresh = (refresh: number) => void navigate({ to: '.', search: { ...search, refresh } });

	return (
		<Card>
			<CardHeader className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
				<div className="flex-1 min-w-0">
					<CardTitle>Jobs</CardTitle>
					<CardDescription>
						Operations Harper runs in the background — CSV and S3 loads, exports, bulk deletes, backups — started in the
						selected window, newest first.
						{instanceParams.entityType === 'cluster'
							&& " Job records stay on the node that ran them, so on a cluster this lists the jobs of the node Studio's request reached; open an instance's Status page for a specific node."}
					</CardDescription>
				</div>
				{allowed && (
					<JobsToolbar
						range={range}
						onRangeChange={setRange}
						refreshMs={search.refresh}
						onRefreshChange={setRefresh}
						onRefreshNow={() => void query.refetch()}
						isFetching={query.isFetching}
					/>
				)}
			</CardHeader>
			<CardContent>
				<JobsBody allowed={allowed} query={query} />
			</CardContent>
		</Card>
	);
}

function JobsBody({ allowed, query }: { allowed: boolean | undefined; query: UseQueryResult<JobRecord[], unknown> }) {
	if (allowed === undefined) {
		return <div role="status" aria-label="Loading" className="h-64 rounded-md bg-muted/30 animate-pulse" />;
	}
	if (!allowed || isForbiddenError(query.error)) {
		return (
			<div role="note" className="rounded-md border border-border bg-muted/20 p-4 text-sm text-muted-foreground">
				<p className="mb-1 font-medium text-foreground">Your role can't list jobs on this instance.</p>
				<p>
					Listing jobs needs a super user role. Harper reserves <code>search_jobs_by_start_date</code>{' '}
					for super users unless an operations allowlist grants it, and not every Harper version honours that grant.
				</p>
			</div>
		);
	}
	const jobs = query.data ?? [];
	return (
		<PanelStateOrChart
			isLoading={query.isLoading}
			isError={query.isError}
			error={query.error instanceof Error ? query.error : null}
			isEmpty={jobs.length === 0}
			emptyMessage="No jobs started in the selected time range."
			onRetry={() => void query.refetch()}
		>
			<PanelErrorBoundary metric="jobs" resetKey={query.dataUpdatedAt}>
				<JobsTable jobs={jobs.slice(0, MAX_RENDERED_JOBS)} />
			</PanelErrorBoundary>
			{jobs.length > MAX_RENDERED_JOBS && (
				<p className="mt-3 text-xs text-muted-foreground">
					Showing the {MAX_RENDERED_JOBS} most recent of {jobs.length.toLocaleString()} jobs in this range.
				</p>
			)}
		</PanelStateOrChart>
	);
}

function JobsTable({ jobs }: { jobs: JobRecord[] }) {
	const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
	const toggle = (id: string) =>
		setExpanded((current) => {
			const next = new Set(current);
			if (!next.delete(id)) {
				next.add(id);
			}
			return next;
		});

	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead className="w-8">
						<span className="sr-only">Details</span>
					</TableHead>
					<TableHead>Status</TableHead>
					<TableHead>Type</TableHead>
					<TableHead>Started</TableHead>
					<TableHead>Duration</TableHead>
					<TableHead>User</TableHead>
					<TableHead>Message</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{jobs.map((job) => {
					const isOpen = expanded.has(job.id);
					const status = describeJobStatus(job.status);
					const duration = jobDurationMs(job);
					const message = errorText(job.message);
					const detailsId = `job-details-${job.id}`;
					return (
						<Fragment key={job.id}>
							<TableRow className="cursor-pointer hover:bg-muted/30" onClick={() => toggle(job.id)}>
								<TableCell>
									<Button
										type="button"
										variant="ghost"
										size="icon"
										className="size-7"
										aria-expanded={isOpen}
										aria-controls={detailsId}
										aria-label={isOpen ? `Hide details for job ${job.id}` : `Show details for job ${job.id}`}
										onClick={(event) => {
											event.stopPropagation();
											toggle(job.id);
										}}
									>
										<ChevronRightIcon className={cn('transition-transform', isOpen && 'rotate-90')} />
									</Button>
								</TableCell>
								<TableCell>
									<Badge variant={status.variant}>{status.label}</Badge>
								</TableCell>
								<TableCell className="font-mono text-xs">{job.type ?? '—'}</TableCell>
								<TableCell className="whitespace-nowrap">{formatJobTime(job.start_datetime)}</TableCell>
								<TableCell className="whitespace-nowrap tabular-nums">
									{duration === undefined ? '—' : formatDuration(duration)}
								</TableCell>
								<TableCell>{job.user ?? '—'}</TableCell>
								<TableCell className="max-w-[28rem] truncate" title={message}>{message ?? '—'}</TableCell>
							</TableRow>
							{isOpen && (
								<TableRow id={detailsId} className="bg-muted/10">
									<TableCell colSpan={7}>
										<JobDetails job={job} message={message} />
									</TableCell>
								</TableRow>
							)}
						</Fragment>
					);
				})}
			</TableBody>
		</Table>
	);
}

function JobDetails({ job, message }: { job: JobRecord; message: string | undefined }) {
	return (
		<div className="grid gap-3 py-2 text-sm">
			<dl className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-[max-content_1fr]">
				<dt className="text-muted-foreground">Job ID</dt>
				<dd className="font-mono break-all">{job.id}</dd>
				<dt className="text-muted-foreground">Created</dt>
				<dd>{formatJobTime(job.created_datetime)}</dd>
				<dt className="text-muted-foreground">Started</dt>
				<dd>{formatJobTime(job.start_datetime)}</dd>
				<dt className="text-muted-foreground">Ended</dt>
				<dd>{formatJobTime(job.end_datetime)}</dd>
			</dl>
			{message && (
				<div>
					<div className="mb-1 text-muted-foreground">Message</div>
					<pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/30 p-2 text-xs">
						{message}
					</pre>
				</div>
			)}
			{job.result !== undefined && (
				<div>
					<div className="mb-1 text-muted-foreground">Result</div>
					<pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/30 p-2 text-xs">
						{typeof job.result === 'string' ? job.result : JSON.stringify(job.result, null, 2)}
					</pre>
				</div>
			)}
		</div>
	);
}

interface ToolbarProps {
	range: TimePresetId;
	onRangeChange: (range: TimePresetId) => void;
	refreshMs: number;
	onRefreshChange: (refreshMs: number) => void;
	onRefreshNow: () => void;
	isFetching: boolean;
}

function JobsToolbar({ range, onRangeChange, refreshMs, onRefreshChange, onRefreshNow, isFetching }: ToolbarProps) {
	return (
		<div className="flex items-center gap-3 shrink-0">
			<Select value={range} onValueChange={(value) => onRangeChange(value as TimePresetId)}>
				<SelectTrigger className="w-[160px]" aria-label="Jobs started within">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{JOB_WINDOW_PRESETS.map((preset) => <SelectItem key={preset.id} value={preset.id}>{preset.label}
					</SelectItem>)}
				</SelectContent>
			</Select>
			<div
				role="group"
				aria-label="Auto-refresh"
				className="flex items-stretch rounded-md border border-input bg-white shadow-xs dark:bg-grey-700"
			>
				<Select value={String(refreshMs)} onValueChange={(value) => onRefreshChange(Number(value))}>
					<SelectTrigger
						aria-label="Auto-refresh interval"
						title="Auto-refresh interval"
						className="w-[84px] rounded-r-none border-0 bg-transparent shadow-none dark:bg-transparent"
					>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{REFRESH_OPTIONS.map((option) => (
							<SelectItem key={option.value} value={String(option.value)}>{option.label}</SelectItem>
						))}
					</SelectContent>
				</Select>
				<span aria-hidden="true" className="my-1.5 w-px shrink-0 bg-border" />
				<Button
					type="button"
					variant="ghost"
					size="icon"
					onClick={onRefreshNow}
					disabled={isFetching}
					aria-busy={isFetching}
					aria-label={isFetching ? 'Refreshing…' : 'Refresh now'}
					title={isFetching ? 'Refreshing…' : 'Refresh now'}
					className="rounded-l-none"
				>
					<RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
				</Button>
			</div>
		</div>
	);
}
