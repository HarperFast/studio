import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
	activeRunsQueryOptions,
	agentOverviewQueryKey,
	invalidateRunLists,
	PAST_RUN_STATUSES,
	RUN_MAX_END,
	RUN_MAX_PAGE,
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
	ConfidenceLabel,
	LoadFailed,
	runCostLabel,
	runDuration,
	RunStatusLabel,
	stageLabel,
	triggerLabel,
	VerdictLabel,
} from '@/features/admin/agent/components/AgentBits';
import { RefreshFailed, Timestamp } from '@/features/admin/workflows/components/WorkflowBits';
import { useDebounce } from '@/hooks/useDebounce';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ChevronRightIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

const ALL = 'all';

function RunLink({ run }: { run: RunSummary }) {
	return (
		<div className="min-w-40 space-y-1">
			<Link
				to="/admin/agent/$runId"
				params={{ runId: run.id }}
				aria-label={`${run.clusterName || run.clusterId || triggerLabel(run.triggerKind)} ${run.id}`}
				title={run.clusterId}
				className="group inline-flex items-center gap-2 rounded-sm text-sm font-medium text-foreground hover:underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"
			>
				{run.clusterName || run.clusterId || triggerLabel(run.triggerKind)}
				<ChevronRightIcon aria-hidden="true" className="size-3.5 text-muted-foreground group-hover:text-foreground" />
			</Link>
			{run.organizationId && (
				<div className="text-xs text-muted-foreground">{run.organizationName ?? run.organizationId}</div>
			)}
			<div className="font-mono text-[11px] text-muted-foreground/70">{run.id}</div>
		</div>
	);
}

/**
 * Polls the open runs for the whole page, whichever tab is showing. A run that appears or leaves the list is new or
 * newly finished, which is when spend and the past list change, so both are refetched then rather than on their timers.
 */
export function useActiveRunChanges() {
	const queryClient = useQueryClient();
	// Only the set of ids, so a poll that changes nothing but a stage does not re-render the page.
	const { data: ids = null } = useQuery({
		...activeRunsQueryOptions(),
		select: (rows) => rows.map((run) => run.id).sort().join(','),
	});
	const previous = useRef<string | null>(null);

	useEffect(() => {
		if (ids === null) { return; }
		if (previous.current !== null && previous.current !== ids) {
			void invalidateRunLists(queryClient, { exceptActive: true });
			void queryClient.invalidateQueries({ queryKey: agentOverviewQueryKey });
		}
		previous.current = ids;
	}, [ids, queryClient]);
}

export function ActiveRuns({ canCancel }: { canCancel: boolean }) {
	const { data, error, isLoading } = useQuery(activeRunsQueryOptions());

	return (
		<section
			aria-label="Active runs"
			className={data?.length === 0
				? 'flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card/40 px-4 py-3'
				: undefined}
		>
			<div className="flex items-center gap-2">
				<h2 className="text-base font-semibold">Active</h2>
				{data && (
					<span className="rounded-md bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
						{data.length}
					</span>
				)}
			</div>
			<div className={data?.length === 0 ? undefined : 'mt-2'}>
				{isLoading
					? <p className="text-sm text-muted-foreground">Loading active runs…</p>
					: !data
					? <LoadFailed what="active runs" error={error} />
					: (
						<>
							{error && <RefreshFailed error={error} />}
							{data.length >= RUN_MAX_PAGE && (
								<p className="mb-2 text-sm text-muted-foreground">
									Showing the newest {RUN_MAX_PAGE}{' '}
									open runs. To find an older one, set Past runs to Open and filter by cluster or organization.
								</p>
							)}
							{data.length === 0
								? (
									<p className="text-xs text-muted-foreground">
										No run is in progress.
									</p>
								)
								: (
									<div className="overflow-x-auto rounded-xl border bg-card/60 px-4 [&_th]:h-11 [&_th]:text-[11px] [&_th]:font-medium [&_th]:uppercase [&_th]:tracking-wider [&_td]:py-4 [&_td]:align-top [&_td]:text-xs">
										<Table className="min-w-[48rem] [&_td:not(:last-child)]:pr-5">
											<TableHeader>
												<TableRow>
													<TableHead>Run</TableHead>

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

														<TableCell className="whitespace-normal">{triggerLabel(run.triggerKind)}</TableCell>
														<TableCell className="min-w-24 max-w-28 whitespace-normal text-xs leading-relaxed">
															<Timestamp value={run.startedAt ?? run.createdAt} />
														</TableCell>
														<TableCell>
															<span className="flex items-center gap-2">
																<RunStatusLabel status={run.status} />
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

type StatusChoice = 'terminal' | (typeof PAST_RUN_STATUSES)[number] | 'active';

function StatusSelect({ value, onChange }: { value: StatusChoice; onChange: (value: StatusChoice) => void }) {
	return (
		<Select value={value} onValueChange={(next) => onChange(next as StatusChoice)}>
			<SelectTrigger aria-label="Status" className="w-44">
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				<SelectItem value="terminal">Any finished status</SelectItem>
				{PAST_RUN_STATUSES.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
				<SelectItem value="active">Open (any age)</SelectItem>
			</SelectContent>
		</Select>
	);
}

/** Finished runs by default (`status=terminal`), filtered and paged by the server; a short page is the last. */
export function PastRuns() {
	const [rangeChoice, setRangeChoice] = useState<RangeChoice>('default');
	const [fromDay, setFromDay] = useState('');
	const [toDay, setToDay] = useState('');
	const [status, setStatus] = useState<StatusChoice>('terminal');
	const [triggerKind, setTriggerKind] = useState<TriggerKind | typeof ALL>(ALL);
	const [verdict, setVerdict] = useState<Verdict | typeof ALL>(ALL);
	const [clusterId, setClusterId] = useState('');
	const [organizationId, setOrganizationId] = useState('');
	const [start, setStart] = useState(0);
	const debouncedCluster = useDebounce(clusterId.trim(), 400);
	const debouncedOrganization = useDebounce(organizationId.trim(), 400);

	const filters = useMemo<RunFilters>(() => ({
		range: rangeFor(rangeChoice, fromDay, toDay),
		status,
		triggerKind: triggerKind === ALL ? undefined : triggerKind,
		verdict: verdict === ALL ? undefined : verdict,
		clusterId: debouncedCluster || undefined,
		organizationId: debouncedOrganization || undefined,
	}), [rangeChoice, fromDay, toDay, status, triggerKind, verdict, debouncedCluster, debouncedOrganization]);

	const filterKey = JSON.stringify(filters);
	const [pagedKey, setPagedKey] = useState(filterKey);
	if (pagedKey !== filterKey) {
		setPagedKey(filterKey);
		setStart(0);
	}

	const { data, error, isLoading } = useQuery(runListQueryOptions(filters, start));
	const rows = data ?? [];
	const hasNext = data !== undefined && data.length === RUN_PAGE_SIZE && start + 2 * RUN_PAGE_SIZE <= RUN_MAX_END;

	return (
		<section aria-label="Past runs" className="mt-6">
			<h2 className="text-base font-semibold">Past runs</h2>
			<div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3 [&>*]:w-full">
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
				<StatusSelect value={status} onChange={setStatus} />
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
										{start === 0 ? 'No run matches these filters.' : 'No run on this page.'}
									</p>
								)
								: (
									<div className="overflow-x-auto rounded-xl border bg-card/60 px-4 [&_th]:h-11 [&_th]:text-[11px] [&_th]:font-medium [&_th]:uppercase [&_th]:tracking-wider [&_td]:py-4 [&_td]:align-top [&_td]:text-xs">
										<Table className="min-w-[48rem] [&_td:not(:last-child)]:pr-5">
											<TableHeader>
												<TableRow>
													<TableHead>Run</TableHead>
													<TableHead>Created</TableHead>

													<TableHead>Trigger</TableHead>
													<TableHead>Status</TableHead>
													<TableHead>Verdict</TableHead>
													<TableHead className="text-right">Usage</TableHead>
												</TableRow>
											</TableHeader>
											<TableBody>
												{rows.map((run) => (
													<TableRow key={run.id}>
														<TableCell>
															<RunLink run={run} />
														</TableCell>
														<TableCell className="min-w-24 max-w-28 whitespace-normal text-xs leading-relaxed">
															<Timestamp value={run.createdAt} />
														</TableCell>

														<TableCell className="whitespace-normal">{triggerLabel(run.triggerKind)}</TableCell>
														<TableCell>
															<RunStatusLabel status={run.status} />
														</TableCell>
														<TableCell>
															<VerdictLabel verdict={run.verdict} />
															{run.confidence && (
																<div className="pl-[30px]">
																	<ConfidenceLabel confidence={run.confidence} />
																</div>
															)}
														</TableCell>
														<TableCell className="text-right tabular-nums text-xs">
															<div>{runCostLabel(run)}</div>
															<div className="mt-1 text-muted-foreground">{runDuration(run)}</div>
														</TableCell>
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
						{!!data?.length && (
							<span className="text-xs text-muted-foreground">
								Rows {start + 1}–{start + data.length}
							</span>
						)}
					</div>
				)}
			</div>
		</section>
	);
}
