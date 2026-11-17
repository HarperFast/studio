import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
	agentOverviewQueryKey,
	invalidateRunLists,
	isOpenRun,
	PAST_RUN_STATUSES,
	RUN_MAX_END,
	RUN_PAGE_SIZE,
	RunFilters,
	runListQueryOptions,
	RunRange,
	RunSummary,
	TRIGGER_KINDS,
	TriggerKind,
	Verdict,
	VERDICTS,
} from '@/features/admin/agent/agentAdminApi';
import {
	CancelRunButton,
	LoadFailed,
	runCostLabel,
	runDuration,
	RunStatusBadge,
	stageLabel,
	triggerLabel,
	VerdictBadge,
} from '@/features/admin/agent/components/AgentBits';
import { RefreshFailed, Timestamp } from '@/features/admin/workflows/components/WorkflowBits';
import { useDebounce } from '@/hooks/useDebounce';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';

const ACTIVE_FILTERS: RunFilters = { range: { kind: 'default' }, status: 'active' };
const ALL = 'all';

function RunLink({ run }: { run: Pick<RunSummary, 'id'> }) {
	return (
		<Link
			to="/admin/agent/$runId"
			params={{ runId: run.id }}
			className="font-mono text-xs underline-offset-2 hover:underline"
		>
			{run.id}
		</Link>
	);
}

function ClusterCell({ run }: { run: Pick<RunSummary, 'clusterId' | 'organizationId'> }) {
	return (
		<div className="flex flex-col font-mono text-xs">
			<span>{run.clusterId}</span>
			{run.organizationId && <span className="text-muted-foreground">{run.organizationId}</span>}
		</div>
	);
}

/**
 * Open runs, every 5 s. A run that appears or leaves this list is new or newly finished, which is when spend and the
 * past list change, so both are refetched then rather than waiting for their own timers.
 */
export function ActiveRuns({ canCancel }: { canCancel: boolean }) {
	const queryClient = useQueryClient();
	const { data, error, isLoading } = useQuery(runListQueryOptions(ACTIVE_FILTERS));
	const previous = useRef<string | null>(null);
	const ids = data ? data.map((run) => run.id).sort().join(',') : null;

	useEffect(() => {
		if (ids === null) { return; }
		if (previous.current !== null && previous.current !== ids) {
			void invalidateRunLists(queryClient);
			void queryClient.invalidateQueries({ queryKey: agentOverviewQueryKey });
		}
		previous.current = ids;
	}, [ids, queryClient]);

	return (
		<section aria-label="Active runs">
			<h2 className="text-lg font-light">Active</h2>
			<div className="mt-2">
				{isLoading
					? <p className="text-sm text-muted-foreground">Loading active runs…</p>
					: !data
					? <LoadFailed what="active runs" error={error} />
					: (
						<>
							{error && <RefreshFailed error={error} />}
							{data.length === 0
								? <p className="text-sm text-muted-foreground">No run is in progress.</p>
								: (
									<div className="overflow-x-auto">
										<Table>
											<TableHeader>
												<TableRow>
													<TableHead>Run</TableHead>
													<TableHead>Cluster</TableHead>
													<TableHead>Trigger</TableHead>
													<TableHead>Started</TableHead>
													<TableHead>Step</TableHead>
													<TableHead className="w-0" />
												</TableRow>
											</TableHeader>
											<TableBody>
												{data.map((run) => (
													<TableRow key={run.id}>
														<TableCell>
															<RunLink run={run} />
														</TableCell>
														<TableCell>
															<ClusterCell run={run} />
														</TableCell>
														<TableCell>{triggerLabel(run.triggerKind)}</TableCell>
														<TableCell className="text-xs">
															<Timestamp value={run.startedAt ?? run.createdAt} />
														</TableCell>
														<TableCell>
															<span className="flex items-center gap-2">
																<RunStatusBadge status={run.status} />
																<span className="text-xs text-muted-foreground">{stageLabel(run.stage)}</span>
															</span>
														</TableCell>
														<TableCell className="text-right">
															{canCancel && <CancelRunButton run={run} />}
														</TableCell>
													</TableRow>
												))}
											</TableBody>
										</Table>
									</div>
								)}
						</>
					)}
			</div>
		</section>
	);
}

type RangeChoice = 'default' | '24h' | '7d' | 'custom';

/** A custom range is whole UTC days with the end day included; `to` is exclusive on the server, so the day after. */
export function rangeFor(choice: RangeChoice, fromDay: string, toDay: string): RunRange {
	if (choice === '24h') { return { kind: 'last', hours: 24 }; }
	if (choice === '7d') { return { kind: 'last', hours: 24 * 7 }; }
	if (choice === 'custom' && fromDay && toDay) {
		const end = new Date(`${toDay}T00:00:00.000Z`);
		if (!Number.isNaN(end.getTime())) {
			end.setUTCDate(end.getUTCDate() + 1);
			return { kind: 'between', from: fromDay, to: end.toISOString().slice(0, 10) };
		}
	}
	return { kind: 'default' };
}

function FilterSelect<T extends string>(
	{ label, value, onChange, options, render }: {
		label: string;
		value: T | typeof ALL;
		onChange: (value: T | typeof ALL) => void;
		options: readonly T[];
		render?: (value: T) => string;
	},
) {
	return (
		<Select value={value} onValueChange={(next) => onChange(next as T | typeof ALL)}>
			<SelectTrigger aria-label={label} className="w-44">
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				<SelectItem value={ALL}>Any {label.toLowerCase()}</SelectItem>
				{options.map((option) => <SelectItem key={option} value={option}>{render ? render(option) : option}
				</SelectItem>)}
			</SelectContent>
		</Select>
	);
}

/**
 * Finished runs, filtered and paged by the server. Open runs on the page are left out here because Active shows them,
 * so a page can hold fewer rows than were asked for; only the server's row count decides whether there is a next page.
 */
export function PastRuns() {
	const [rangeChoice, setRangeChoice] = useState<RangeChoice>('default');
	const [fromDay, setFromDay] = useState('');
	const [toDay, setToDay] = useState('');
	const [status, setStatus] = useState<(typeof PAST_RUN_STATUSES)[number] | typeof ALL>(ALL);
	const [triggerKind, setTriggerKind] = useState<TriggerKind | typeof ALL>(ALL);
	const [verdict, setVerdict] = useState<Verdict | typeof ALL>(ALL);
	const [clusterId, setClusterId] = useState('');
	const [organizationId, setOrganizationId] = useState('');
	const [start, setStart] = useState(0);
	const debouncedCluster = useDebounce(clusterId.trim(), 400);
	const debouncedOrganization = useDebounce(organizationId.trim(), 400);

	const filters = useMemo<RunFilters>(() => ({
		range: rangeFor(rangeChoice, fromDay, toDay),
		status: status === ALL ? undefined : status,
		triggerKind: triggerKind === ALL ? undefined : triggerKind,
		verdict: verdict === ALL ? undefined : verdict,
		clusterId: debouncedCluster || undefined,
		organizationId: debouncedOrganization || undefined,
	}), [rangeChoice, fromDay, toDay, status, triggerKind, verdict, debouncedCluster, debouncedOrganization]);

	// A new filter starts from the first page.
	const filterKey = JSON.stringify(filters);
	const [pagedKey, setPagedKey] = useState(filterKey);
	if (pagedKey !== filterKey) {
		setPagedKey(filterKey);
		setStart(0);
	}

	const { data, error, isLoading } = useQuery(runListQueryOptions(filters, start));
	const rows = data?.filter((run) => !isOpenRun(run)) ?? [];
	const hasNext = data !== undefined && data.length === RUN_PAGE_SIZE && start + 2 * RUN_PAGE_SIZE <= RUN_MAX_END;

	return (
		<section aria-label="Past runs" className="mt-8">
			<h2 className="text-lg font-light">Past runs</h2>
			<div className="mt-2 flex flex-wrap items-center gap-2">
				<Select value={rangeChoice} onValueChange={(next) => setRangeChoice(next as RangeChoice)}>
					<SelectTrigger aria-label="Time range" className="w-44">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="24h">Last 24 hours</SelectItem>
						<SelectItem value="7d">Last 7 days</SelectItem>
						<SelectItem value="default">Last 30 days</SelectItem>
						<SelectItem value="custom">Custom range</SelectItem>
					</SelectContent>
				</Select>
				{rangeChoice === 'custom' && (
					<>
						<Input
							type="date"
							aria-label="From (UTC)"
							value={fromDay}
							onChange={(e) => setFromDay(e.target.value)}
							className="w-40"
						/>
						<Input
							type="date"
							aria-label="To (UTC, included)"
							value={toDay}
							onChange={(e) => setToDay(e.target.value)}
							className="w-40"
						/>
					</>
				)}
				<FilterSelect label="Status" value={status} onChange={setStatus} options={PAST_RUN_STATUSES} />
				<FilterSelect
					label="Trigger"
					value={triggerKind}
					onChange={setTriggerKind}
					options={TRIGGER_KINDS}
					render={triggerLabel}
				/>
				<FilterSelect label="Verdict" value={verdict} onChange={setVerdict} options={VERDICTS} />
				<Input
					value={clusterId}
					onChange={(e) => setClusterId(e.target.value)}
					placeholder="Cluster id"
					aria-label="Cluster id"
					className="w-44"
				/>
				<Input
					value={organizationId}
					onChange={(e) => setOrganizationId(e.target.value)}
					placeholder="Organization id"
					aria-label="Organization id"
					className="w-44"
				/>
			</div>
			{rangeChoice === 'custom' && (!fromDay || !toDay) && (
				<p className="mt-2 text-xs text-muted-foreground">Pick both days; until then the last 30 days are shown.</p>
			)}

			<div className="mt-4">
				{isLoading
					? <p className="text-sm text-muted-foreground">Loading runs…</p>
					: !data
					? <LoadFailed what="runs" error={error} />
					: (
						<>
							{error && <RefreshFailed error={error} />}
							{rows.length === 0
								? (
									<p className="text-sm text-muted-foreground">
										{start === 0 ? 'No finished run matches these filters.' : 'No finished run on this page.'}
									</p>
								)
								: (
									<div className="overflow-x-auto">
										<Table>
											<TableHeader>
												<TableRow>
													<TableHead>Run</TableHead>
													<TableHead>Created</TableHead>
													<TableHead>Cluster</TableHead>
													<TableHead>Trigger</TableHead>
													<TableHead>Status</TableHead>
													<TableHead>Verdict</TableHead>
													<TableHead>Duration</TableHead>
													<TableHead>Cost</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{rows.map((run) => (
													<TableRow key={run.id}>
														<TableCell>
															<RunLink run={run} />
														</TableCell>
														<TableCell className="text-xs">
															<Timestamp value={run.createdAt} />
														</TableCell>
														<TableCell>
															<ClusterCell run={run} />
														</TableCell>
														<TableCell>{triggerLabel(run.triggerKind)}</TableCell>
														<TableCell>
															<RunStatusBadge status={run.status} />
														</TableCell>
														<TableCell>
															<VerdictBadge verdict={run.verdict} />
															{run.confidence && (
																<span className="ml-1 text-xs text-muted-foreground">{run.confidence}</span>
															)}
														</TableCell>
														<TableCell className="tabular-nums">{runDuration(run)}</TableCell>
														<TableCell className="tabular-nums">{runCostLabel(run)}</TableCell>
													</TableRow>
												))}
											</TableBody>
										</Table>
									</div>
								)}
						</>
					)}
				{(start > 0 || hasNext) && (
					<div className="mt-3 flex items-center gap-2">
						<Button
							variant="outline"
							size="sm"
							disabled={start === 0}
							onClick={() => setStart(Math.max(0, start - RUN_PAGE_SIZE))}
						>
							Newer
						</Button>
						<Button variant="outline" size="sm" disabled={!hasNext} onClick={() => setStart(start + RUN_PAGE_SIZE)}>
							Older
						</Button>
						<span className="text-xs text-muted-foreground">
							Rows {start + 1}–{start + (data?.length ?? 0)}
						</span>
					</div>
				)}
			</div>
		</section>
	);
}
