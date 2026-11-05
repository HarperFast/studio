import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Timestamp } from '@/features/organization/serviceAccounts/components/Timestamp';
import {
	SCHEDULER_LOG_LIMIT,
	schedulerJobRowId,
	SchedulerState,
} from '@/integrations/api/instance/scheduler/scheduler';
import { formatDuration } from '@/lib/formatDuration';
import { PencilIcon, PlusIcon, Trash2Icon, TriangleAlertIcon } from 'lucide-react';
import { AppJobsConfig, handlerFileProblem, ScheduledJobConfig } from './jobsConfig';
import { describeInterval } from './schedule';
import { SchedulerApp } from './schedulerApps';
import { SchedulerLogIndex } from './schedulerLog';
import { SentenceTime } from './SentenceTime';

export interface RunSources {
	/** `system.hdb_scheduler_state`, where Harper lets Studio read it. */
	state?: SchedulerState;
	statePending: boolean;
	/** `undefined` while loading or when it couldn't be read. */
	log?: SchedulerLogIndex;
	logFailed: boolean;
}

function JobSchedule({ job }: { job: ScheduledJobConfig }) {
	if (job.cron !== undefined) {
		return (
			<span>
				<code className="font-mono">{job.cron}</code>
				<span className="block text-xs text-muted-foreground">{job.timezone ?? "The server's timezone"}</span>
			</span>
		);
	}
	if (job.interval !== undefined) {
		return <span>{describeInterval(job.interval)}</span>;
	}
	return <span className="text-muted-foreground">—</span>;
}

function LastRun({ app, job, sources }: { app: string; job: ScheduledJobConfig; sources: RunSources }) {
	if (job.name === undefined) {
		return <span className="text-muted-foreground">—</span>;
	}
	if (sources.state) {
		const run = sources.state.runs.get(schedulerJobRowId(app, job.name));
		if (!run?.lastRunAt) {
			return <span className="text-muted-foreground">Not run yet</span>;
		}
		const failed = run.lastStatus === 'error';
		return (
			<span className="space-y-1">
				<span className="flex flex-wrap items-center gap-2">
					<Badge variant={failed ? 'destructive' : 'success'}>{failed ? 'Failed' : 'Succeeded'}</Badge>
					<Timestamp value={run.lastRunAt} format="relative" />
					{typeof run.lastDurationMs === 'number' && (
						<span className="text-xs text-muted-foreground">took {formatDuration(run.lastDurationMs)}</span>
					)}
				</span>
				{failed && run.lastError && <span className="block break-words text-xs text-red">{run.lastError}</span>}
			</span>
		);
	}
	if (sources.statePending) {
		return <span className="text-muted-foreground">Loading…</span>;
	}
	if (sources.logFailed) {
		return <span className="text-muted-foreground">Couldn’t read the log</span>;
	}
	if (!sources.log) {
		return <span className="text-muted-foreground">Loading…</span>;
	}
	const failure = sources.log.failures.get(schedulerJobRowId(app, job.name));
	if (!failure) {
		return (
			<span className="text-muted-foreground">None in the last {SCHEDULER_LOG_LIMIT.toLocaleString()} log lines</span>
		);
	}
	return (
		<span className="space-y-1">
			<span className="flex flex-wrap items-center gap-2">
				<Badge variant="destructive">Failed</Badge>
				<Timestamp value={failure.at} format="relative" />
				<span className="text-xs text-muted-foreground">
					took {formatDuration(failure.durationMs)}
					{failure.node ? ` on ${failure.node}` : ''}
				</span>
			</span>
			<span className="block break-words text-xs text-red">{failure.error}</span>
		</span>
	);
}

function LoadFailure({ app, sources }: { app: SchedulerApp; sources: RunSources }) {
	const logged = sources.log?.loadErrors.get(app.name);
	return (
		<Alert variant="destructive" role="alert">
			<TriangleAlertIcon />
			<AlertDescription>
				<p className="font-medium">Harper couldn’t load this app’s jobs, so none of them run.</p>
				{logged
					? (
						<p>
							{logged.reason}{' '}
							<span className="text-xs">
								(<SentenceTime value={logged.at} />)
							</span>
						</p>
					)
					: sources.logFailed
					? <p>Studio couldn’t read Harper’s log for the reason. The problems Studio can see are marked below.</p>
					: !sources.log
					? <p>Reading Harper’s log for the reason…</p>
					: (
						<p>
							Harper’s log doesn’t say why: an instance running one worker thread prints the reason to its console
							instead. The problems Studio can see are marked below.
						</p>
					)}
			</AlertDescription>
		</Alert>
	);
}

export function AppJobsCard({
	app,
	config,
	sources,
	canEdit,
	onAdd,
	onEdit,
	onRemove,
}: {
	app: SchedulerApp;
	config: AppJobsConfig;
	sources: RunSources;
	canEdit: boolean;
	onAdd: () => void;
	onEdit: (job: ScheduledJobConfig) => void;
	onRemove: (job: ScheduledJobConfig) => void;
}) {
	return (
		<Card>
			<CardHeader className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
				<div className="min-w-0 space-y-1">
					<CardTitle className="break-all">{app.name}</CardTitle>
					<CardDescription>
						{app.readOnly ?? `Jobs from ${app.configFile ?? 'config.yaml'}.`}
					</CardDescription>
				</div>
				{canEdit && (
					<Button variant="defaultOutline" size="sm" onClick={onAdd}>
						<PlusIcon /> Add job
					</Button>
				)}
			</CardHeader>
			<CardContent className="space-y-3">
				{app.schedulerFailed && <LoadFailure app={app} sources={sources} />}
				{config.problem && (
					<Alert variant="destructive" role="alert">
						<TriangleAlertIcon />
						<AlertDescription>
							{config.problem} Change it in the editor instead.
						</AlertDescription>
					</Alert>
				)}
				{config.jobs.length > 0 && (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className="pr-4">Name</TableHead>
								<TableHead className="pr-4">Schedule</TableHead>
								<TableHead className="pr-4">Handler</TableHead>
								<TableHead className="pr-4">{sources.state ? 'Last run' : 'Last failure'}</TableHead>
								{canEdit && (
									<TableHead className="w-0">
										<span className="sr-only">Actions</span>
									</TableHead>
								)}
							</TableRow>
						</TableHeader>
						<TableBody>
							{config.jobs.map((job) => {
								const problem = job.problem ?? (job.handler ? handlerFileProblem(job.handler, app.files) : undefined);
								return (
									<TableRow key={job.index}>
										<TableCell className="py-2 pr-4 align-top font-medium">
											{job.name ?? <span className="text-muted-foreground">(no name)</span>}
											{problem && (
												<span className="mt-1 flex max-w-xs gap-1 whitespace-normal text-xs font-normal text-red">
													<TriangleAlertIcon className="size-3 shrink-0 translate-y-0.5" />
													{problem}
												</span>
											)}
										</TableCell>
										<TableCell className="py-2 pr-4 align-top">
											<JobSchedule job={job} />
										</TableCell>
										<TableCell className="py-2 pr-4 align-top">
											<code className="break-all font-mono text-xs">{job.handler ?? '—'}</code>
										</TableCell>
										<TableCell className="max-w-sm py-2 pr-4 whitespace-normal align-top">
											<LastRun app={app.name} job={job} sources={sources} />
										</TableCell>
										{canEdit && (
											<TableCell className="py-2 pr-4 align-top">
												<div className="flex gap-1">
													<Button
														variant="ghost"
														size="icon"
														aria-label={`Change ${job.name ?? 'job'}`}
														onClick={() => onEdit(job)}
													>
														<PencilIcon />
													</Button>
													<Button
														variant="destructiveGhost"
														size="icon"
														aria-label={`Remove ${job.name ?? 'job'}`}
														onClick={() => onRemove(job)}
													>
														<Trash2Icon />
													</Button>
												</div>
											</TableCell>
										)}
									</TableRow>
								);
							})}
						</TableBody>
					</Table>
				)}
			</CardContent>
		</Card>
	);
}
