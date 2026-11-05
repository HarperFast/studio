import { Loading } from '@/components/Loading';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@/components/ui/alertDialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { PageNotice } from '@/features/instance/config/previews/PageNotice';
import { useInstanceManagePermission } from '@/hooks/usePermissions';
import { useRefreshClick } from '@/hooks/useRefreshClick';
import { useRestartInstanceClick } from '@/hooks/useRestartInstanceClick';
import { getComponentFileQueryOptions } from '@/integrations/api/instance/applications/getComponentFile';
import { getComponentsQueryOptions } from '@/integrations/api/instance/applications/getComponents';
import {
	canReadSchedulerState,
	getSchedulerLogQueryOptions,
	getSchedulerStateQueryOptions,
	SCHEDULED_JOBS_MIN_VERSION,
	SCHEDULER_LOG_LIMIT,
	SCHEDULER_STATE_READABLE_FROM,
	supportsScheduledJobs,
} from '@/integrations/api/instance/scheduler/scheduler';
import { RegistrationInfoResponse } from '@/integrations/api/instance/status/getRegistrationInfo';
import { isUnansweredWrite } from '@/integrations/api/unansweredWrite';
import { buildAbsoluteLinkToPage } from '@/lib/urls/buildAbsoluteLinkToPage';
import { describeError } from '@/react-query/queryClient';
import { useQueries, useQuery } from '@tanstack/react-query';
import { Link, useLoaderData, useParams } from '@tanstack/react-router';
import { PlusIcon, RefreshCwIcon, RotateCcwIcon, TriangleAlertIcon } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AppJobsCard, RunSources } from './AppJobsCard';
import { JobDialog, JobDialogTarget } from './JobDialog';
import { AppJobsConfig, JobDraft, readAppJobs, removeJob, ScheduledJobConfig, writeJob } from './jobsConfig';
import { SchedulerApp, schedulerApps } from './schedulerApps';
import { indexSchedulerLog } from './schedulerLog';
import { SentenceTime } from './SentenceTime';
import { useSaveAppJobs } from './useSaveAppJobs';

/** Harper's default for a leader whose heartbeat stopped (`HARPER_SCHEDULER_STALE_THRESHOLD_MS`). */
const STALE_HEARTBEAT_MS = 5 * 60_000;

interface AppView {
	app: SchedulerApp;
	text?: string;
	config?: AppJobsConfig;
	isLoading: boolean;
	error: unknown;
}

function HowJobsRun() {
	const params: { clusterId?: string; instanceId?: string; organizationId?: string } = useParams({ strict: false });
	return (
		<div className="rounded-md border p-4 text-sm text-muted-foreground">
			<p className="mb-2 font-medium text-foreground">How scheduled jobs run</p>
			<ul className="list-disc space-y-1 ps-5">
				<li>Each job runs once across the cluster, on whichever node is leading. If it stops, another takes over.</li>
				<li>
					A job can occasionally run twice, during a takeover or a daylight-saving change, so its code should be safe to
					run twice.
				</li>
				<li>After downtime, a cron job makes up only its most recent missed run.</li>
				<li>A new job doesn’t run straight away on its first deploy: it waits for its first scheduled time.</li>
				<li>
					These aren’t the background jobs (exports, loads, backups) on the{' '}
					<Link to={buildAbsoluteLinkToPage(params, 'status')} search={{ tab: 'jobs' }} className="underline">
						Status page
					</Link>.
				</li>
			</ul>
		</div>
	);
}

function Leader({ sources }: { sources: RunSources }) {
	if (sources.state) {
		const leader = sources.state.leader;
		if (!leader?.leaderNode) {
			return <p className="text-sm text-muted-foreground">No node has started running jobs yet.</p>;
		}
		const stale = !leader.lastHeartbeat || Date.now() - Date.parse(leader.lastHeartbeat) > STALE_HEARTBEAT_MS;
		return (
			<p className={stale ? 'text-sm text-red' : 'text-sm text-muted-foreground'}>
				Jobs run on <span className="font-medium text-foreground">{leader.leaderNode}</span>
				{leader.lastHeartbeat && (
					<>
						, which last checked in <SentenceTime value={leader.lastHeartbeat} />
					</>
				)}
				.{stale && ' That’s longer than Harper waits before another node takes over.'}
			</p>
		);
	}
	if (sources.statePending || !sources.log) {
		return null;
	}
	const { takeover } = sources.log;
	return (
		<p className="text-sm text-muted-foreground">
			{takeover
				? (
					<>
						<span className="font-medium text-foreground">{takeover.node}</span> took over running jobs{' '}
						<SentenceTime value={takeover.at} />. Harper logs only a takeover, not each check-in.
					</>
				)
				: 'Harper’s log doesn’t show which node runs the jobs: no takeover is in the part of the log Studio read.'}
		</p>
	);
}

export function ConfigScheduledJobsIndex() {
	const instanceParams = useInstanceClientIdParams();
	const canManage = useInstanceManagePermission();
	// The route's loader read it. The nav hides this page below 5.2, but a bookmark still lands here.
	const { version }: Partial<RegistrationInfoResponse> = useLoaderData({ strict: false }) ?? {};
	const supported = supportsScheduledJobs(version);
	const enabled = canManage && supported === true;
	const readsState = canReadSchedulerState(version);

	const treeQuery = useQuery(getComponentsQueryOptions({ ...instanceParams, enabled }));
	const apps = useMemo(() => schedulerApps(treeQuery.data), [treeQuery.data]);
	const configQueries = useQueries({
		queries: apps.map((app) => ({
			...getComponentFileQueryOptions({ ...instanceParams, project: app.name, file: app.configFile }),
			enabled: enabled && !!app.configFile,
		})),
	});
	const logQuery = useQuery(getSchedulerLogQueryOptions({ ...instanceParams, enabled }));
	const stateQuery = useQuery(getSchedulerStateQueryOptions({ ...instanceParams, enabled: enabled && readsState }));

	// The latest parse per app: a render that changes no file re-parses none, and an old file isn't kept.
	const parsed = useRef(new Map<string, { text: string | undefined; config: AppJobsConfig }>()).current;
	const readJobs = (app: string, text: string | undefined) => {
		const cached = parsed.get(app);
		if (cached && cached.text === text) {
			return cached.config;
		}
		const config = readAppJobs(text);
		parsed.set(app, { text, config });
		return config;
	};
	const views: AppView[] = apps.map((app, index) => {
		const query = configQueries[index];
		const text = app.configFile ? query?.data?.message : undefined;
		const pending = !!app.configFile && !query?.data && !query?.isError;
		return {
			app,
			text,
			config: pending || (app.configFile && query?.isError) ? undefined : readJobs(app.name, text),
			isLoading: pending,
			error: app.configFile ? query?.error : undefined,
		};
	});
	const logIndex = useMemo(() => (logQuery.data ? indexSchedulerLog(logQuery.data) : undefined), [logQuery.data]);
	const sources: RunSources = {
		// React Query keeps the last answer after a refetch fails; the page then says the read failed and uses the log.
		state: readsState && !stateQuery.isError ? stateQuery.data : undefined,
		statePending: readsState && stateQuery.isPending,
		log: logQuery.isError ? undefined : logIndex,
		logFailed: logQuery.isError,
	};
	const canEditView = (view: AppView) => !view.app.readOnly && !!view.config?.editable;
	const shown = views.filter((view) =>
		view.isLoading || view.error != null || view.app.schedulerFailed || !!view.config?.problem
		|| (view.config?.jobs.length ?? 0) > 0
	);
	const addable = views.filter(canEditView);

	const [dialog, setDialog] = useState<JobDialogTarget | undefined>();
	const [removing, setRemoving] = useState<
		{ app: SchedulerApp; job: ScheduledJobConfig; baseText: string | undefined } | undefined
	>();
	const [addApp, setAddApp] = useState<string | undefined>();
	const [restartPending, setRestartPending] = useState(false);
	// A write that lands while a restart is already running isn't covered by it, so it keeps the prompt.
	const writes = useRef(0);
	const writesAtRestart = useRef(0);
	const wrote = () => {
		writes.current += 1;
		setRestartPending(true);
	};
	const save = useSaveAppJobs(instanceParams);
	const { refetch: refetchTree } = treeQuery;
	const { refetch: refetchLog } = logQuery;
	const { refetch: refetchState } = stateQuery;
	// An app with no config file has no read to refetch: forcing one errors, and that hides the app from Add.
	const refetchConfigs = configQueries.filter((_, index) => apps[index]?.configFile).map((query) => query.refetch);
	const refresh = () =>
		Promise.all([
			refetchTree(),
			refetchLog(),
			readsState ? refetchState() : undefined,
			...refetchConfigs.map((refetch) => refetch()),
		]);
	const onRefreshClick = useRefreshClick(refresh);
	const { onRestartClick, isRestartPending } = useRestartInstanceClick({
		operation: 'restart_service',
		instanceClient: instanceParams.instanceClient,
		onRestartedSuccessfully: () => {
			if (writes.current === writesAtRestart.current) {
				setRestartPending(false);
			}
			// The restart reloads every app, so their status and Harper's log both have news.
			void refresh();
		},
	});

	const startRestart = () => {
		writesAtRestart.current = writes.current;
		onRestartClick();
	};
	// A write whose answer was lost may have landed, so it still offers the restart.
	const onWriteError = (error: unknown) => {
		if (isUnansweredWrite(error)) {
			wrote();
		}
	};

	const openDialog = (view: AppView, job?: ScheduledJobConfig) => {
		save.reset();
		setDialog({ app: view.app, job, baseText: view.text, config: view.config });
	};
	const onSave = (draft: JobDraft) => {
		if (!dialog) {
			return;
		}
		const { app, job, baseText } = dialog;
		save.mutate({ app, baseText, change: (text) => writeJob(text, job?.index, draft) }, {
			onSuccess: ({ file }) => {
				setDialog(undefined);
				wrote();
				toast.success(`${job ? 'Saved' : 'Added'} ${draft.name}`, {
					description: `${app.name}/${file} is saved. Restart for Harper to run the change.`,
				});
			},
			onError: onWriteError,
		});
	};
	const onRemove = () => {
		if (!removing) {
			return;
		}
		const { app, job, baseText } = removing;
		save.mutate({ app, baseText, change: (text) => removeJob(text ?? '', job.index) }, {
			onSuccess: () => {
				setRemoving(undefined);
				wrote();
				toast.success(`Removed ${job.name ?? 'the job'}`, {
					description: `It keeps running until ${app.name} restarts.`,
				});
			},
			onError: onWriteError,
		});
	};

	if (!canManage) {
		return <PageNotice>Only super users can view or change scheduled jobs.</PageNotice>;
	}
	if (!version) {
		return (
			<PageNotice>This instance's Harper version could not be read, so its scheduled jobs are not shown.</PageNotice>
		);
	}
	if (!supported) {
		return (
			<PageNotice>
				Scheduled jobs need Harper {SCHEDULED_JOBS_MIN_VERSION} or later. This instance runs {version}.
			</PageNotice>
		);
	}

	const addTarget = addable.find((view) => view.app.name === addApp) ?? addable[0];

	return (
		<div className="flex flex-col gap-4 px-4 md:px-0">
			<div className="flex flex-wrap items-start justify-between gap-2">
				<div className="max-w-2xl space-y-1">
					<h2 className="text-lg font-semibold">Scheduled jobs</h2>
					<p className="text-sm text-muted-foreground">
						Code an app runs on a schedule, declared under <code>scheduler.jobs</code> in its config file.
					</p>
				</div>
				<div className="flex flex-wrap gap-2">
					{addable.length > 0 && (
						<div className="flex gap-2">
							<Select value={addTarget?.app.name} onValueChange={setAddApp}>
								<SelectTrigger className="w-48" aria-label="App to add a job to">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{addable.map((view) => (
										<SelectItem key={view.app.name} value={view.app.name}>{view.app.name}</SelectItem>
									))}
								</SelectContent>
							</Select>
							<Button variant="defaultOutline" onClick={() => addTarget && openDialog(addTarget)}>
								<PlusIcon /> Add job
							</Button>
						</div>
					)}
					<Button
						variant="defaultOutline"
						onClick={onRefreshClick}
						disabled={treeQuery.isFetching || logQuery.isFetching || stateQuery.isFetching
							|| configQueries.some((query) => query.isFetching)}
					>
						<RefreshCwIcon />
						<span className="hidden lg:inline-block">Refresh</span>
					</Button>
				</div>
			</div>

			{restartPending && (
				<Alert variant="warning">
					<TriangleAlertIcon />
					<AlertDescription className="flex flex-wrap items-center justify-between gap-2">
						<span>Harper keeps running the old jobs until the app restarts.</span>
						<Button size="sm" variant="warning" onClick={startRestart} disabled={isRestartPending}>
							<RotateCcwIcon /> {isRestartPending ? 'Restarting…' : 'Restart now'}
						</Button>
					</AlertDescription>
				</Alert>
			)}

			<HowJobsRun />

			<div className="space-y-1">
				<Leader sources={sources} />
				{!readsState && (
					<p className="text-sm text-muted-foreground">
						Harper {version}{' '}
						doesn’t let Studio read each job’s last run, so Studio shows the last failure among the newest{' '}
						{SCHEDULER_LOG_LIMIT.toLocaleString()}{' '}
						scheduler lines in Harper’s log. A successful run isn’t logged. Harper {SCHEDULER_STATE_READABLE_FROM}{' '}
						and later show every run.
					</p>
				)}
				{readsState && stateQuery.isError && (
					<p className="text-sm text-red">
						Studio couldn’t read each job’s last run ({describeError(stateQuery.error).message}), so it shows the last
						failure in Harper’s log.
					</p>
				)}
				{logQuery.isError && (
					<p className="text-sm text-red">Studio couldn’t read Harper’s log: {describeError(logQuery.error).message}</p>
				)}
			</div>

			{treeQuery.isPending
				? <Loading text="Loading..." />
				: treeQuery.isError
				? <PageNotice>Studio couldn’t list this instance’s apps: {describeError(treeQuery.error).message}</PageNotice>
				: shown.length === 0
				? (
					<PageNotice>
						No app on this instance has scheduled jobs.
						{addable.length > 0 ? ' Choose an app above to add one.' : ''}
					</PageNotice>
				)
				: shown.map((view) =>
					view.isLoading
						? <Loading key={view.app.name} text={`Loading ${view.app.name}...`} />
						: view.error != null || !view.config
						? (
							<PageNotice key={view.app.name}>
								Studio couldn’t read {view.app.name}/{view.app.configFile}: {describeError(view.error).message}
							</PageNotice>
						)
						: (
							<AppJobsCard
								key={view.app.name}
								app={view.app}
								config={view.config}
								sources={sources}
								canEdit={canEditView(view)}
								onAdd={() => openDialog(view)}
								onEdit={(job) => openDialog(view, job)}
								onRemove={(job) => {
									save.reset();
									setRemoving({ app: view.app, job, baseText: view.text });
								}}
							/>
						)
				)}

			{dialog && (
				<JobDialog
					key={`${dialog.app.name}:${dialog.job?.index ?? 'new'}`}
					target={dialog}
					instanceParams={instanceParams}
					isSaving={save.isPending}
					saveError={save.error}
					onSave={onSave}
					onClose={() => setDialog(undefined)}
				/>
			)}

			<AlertDialog open={!!removing} onOpenChange={(open) => !open && !save.isPending && setRemoving(undefined)}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Remove {removing?.job.name ?? 'this job'}?</AlertDialogTitle>
						<AlertDialogDescription>
							Studio removes it from{' '}
							{removing?.app.name}/{removing?.app.configFile}. It keeps running until the app restarts.
						</AlertDialogDescription>
					</AlertDialogHeader>
					{save.error != null && removing && (
						<Alert variant="destructive" role="alert">
							<TriangleAlertIcon />
							<AlertDescription>{describeError(save.error).message}</AlertDescription>
						</Alert>
					)}
					<AlertDialogFooter>
						<AlertDialogCancel disabled={save.isPending}>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={(event) => {
								event.preventDefault();
								onRemove();
							}}
							disabled={save.isPending}
						>
							{save.isPending ? 'Removing…' : 'Remove'}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
