import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RefreshFailed, Timestamp, WorkflowStatusBadge } from '@/features/admin/workflows/components/WorkflowBits';
import {
	INTAKE_MODES,
	IntakeMode,
	KNOWN_WORKFLOW_TYPES,
	LIST_PAGE_SIZE,
	useSetIntakeMutation,
	WORKFLOW_STATUSES,
	WorkflowFilters,
	workflowsQueryOptions,
	WorkflowStatus,
	WorkflowSummary,
	workflowSummaryQueryOptions,
} from '@/features/admin/workflows/workflowAdminApi';
import { workflowTypeLabel } from '@/features/admin/workflows/workflowProgress';
import { useStaffPermission } from '@/hooks/useAuth';
import { useDebounce } from '@/hooks/useDebounce';
import { describeError } from '@/react-query/queryClient';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { toast } from 'sonner';

const ACTIVE = 'active';
const ALL = 'all';
type StatusChoice = WorkflowStatus | typeof ACTIVE | typeof ALL;

/** `active` and `all` are the endpoint's `?active=true` and no status; anything else is one status. */
function filtersFor(status: StatusChoice, type: string, clusterId: string): WorkflowFilters {
	return {
		status: status === ACTIVE || status === ALL ? undefined : status,
		active: status === ACTIVE,
		type: type === ALL ? undefined : type,
		clusterId: clusterId.trim() || undefined,
	};
}

// As the executor claims: `queue` holds only PENDING rows; `pause` also stops running ones at their next step boundary,
// and they continue on their own once intake is open again.
const INTAKE_COPY: Record<IntakeMode, string> = {
	open: 'Open: workflows start and run',
	queue: 'Queue: new ones wait, running ones continue',
	pause: 'Pause: every workflow stops at its next step',
};

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: 'alert' }) {
	return (
		<div className="rounded-lg border px-4 py-3">
			<div className="text-xs text-muted-foreground">{label}</div>
			<div className={tone === 'alert' ? 'text-2xl text-destructive' : 'text-2xl'}>{value}</div>
		</div>
	);
}

function formatAge(seconds: number): string {
	if (seconds < 60) { return `${seconds}s`; }
	if (seconds < 3_600) { return `${Math.floor(seconds / 60)}m`; }
	if (seconds < 86_400) { return `${Math.floor(seconds / 3_600)}h ${Math.floor((seconds % 3_600) / 60)}m`; }
	return `${Math.floor(seconds / 86_400)}d ${Math.floor((seconds % 86_400) / 3_600)}h`;
}

function SummaryPanel({ summary }: { summary: WorkflowSummary }) {
	const needsAttention = [
		...summary.pausedOnFailure.map((row) => ({
			id: row.id,
			why: `paused: ${row.reason ?? 'unknown'}`,
			step: row.step,
		})),
		...summary.stuck.map((row) => ({ id: row.id, why: `stuck: ${row.stuckReason}`, step: row.step })),
	];
	return (
		<section aria-label="Summary" className="mt-6 space-y-3">
			<div className="grid grid-cols-2 gap-3 md:grid-cols-5">
				<Stat label="Active" value={summary.active} />
				<Stat label="Running" value={(summary.byStatus.RUNNING ?? 0) + (summary.byStatus.UNDOING ?? 0)} />
				<Stat label="Paused" value={summary.byStatus.PAUSED ?? 0} />
				<Stat
					label="Need attention"
					value={needsAttention.length}
					tone={needsAttention.length ? 'alert' : undefined}
				/>
				<Stat label="Oldest active" value={summary.oldestActive ? formatAge(summary.oldestActiveSeconds) : '—'} />
			</div>
			{summary.lockAvailable === false && (
				<p className="text-sm text-destructive">
					This node cannot take the workflow record lock, so it claims nothing until that clears.
				</p>
			)}
			{needsAttention.length > 0 && (
				<ul className="flex flex-col gap-1 text-sm">
					{needsAttention.map((row) => (
						<li key={`${row.id}:${row.why}`}>
							<Link
								to="/admin/workflows/$workflowId"
								params={{ workflowId: row.id }}
								className="font-mono underline underline-offset-2"
							>
								{row.id}
							</Link>{' '}
							<span className="text-destructive">{row.why}</span>
							{row.step && <span className="text-muted-foreground">{` at ${row.step}`}</span>}
						</li>
					))}
				</ul>
			)}
		</section>
	);
}

/** Reads the mode from the polled summary, so a change another operator makes shows up here too. */
function IntakeControl({ mode }: { mode: IntakeMode }) {
	const canManage = useStaffPermission('workflow:manage');
	const mutation = useSetIntakeMutation();
	return (
		<div className="flex items-center gap-2 text-sm">
			<span className="text-muted-foreground">Intake</span>
			<Select
				value={mode}
				disabled={!canManage || mutation.isPending}
				onValueChange={(next) =>
					mutation.mutate(next as IntakeMode, {
						onSuccess: () => toast.success(`Workflow intake set to ${next}`),
					})}
			>
				<SelectTrigger className="w-72" aria-label="Workflow intake">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{INTAKE_MODES.map((option) => <SelectItem key={option} value={option}>{INTAKE_COPY[option]}</SelectItem>)}
				</SelectContent>
			</Select>
		</div>
	);
}

export function WorkflowsAdminIndex() {
	const [status, setStatus] = useState<StatusChoice>(ACTIVE);
	const [type, setType] = useState<string>(ALL);
	const [clusterText, setClusterText] = useState('');
	const clusterId = useDebounce(clusterText, 300);
	const { data: summary } = useQuery(workflowSummaryQueryOptions());
	const { data: rows, isLoading, isError, error } = useQuery(
		workflowsQueryOptions(filtersFor(status, type, clusterId)),
	);

	return (
		<div>
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div>
					<h1 className="text-2xl font-light">Workflows</h1>
					<p className="mt-2 max-w-3xl text-sm text-muted-foreground">
						Durable workflows central manager runs, such as Harper version upgrades. Each survives a restart and can be
						paused, resumed, retried, undone or abandoned from its page.
					</p>
				</div>
				{summary && <IntakeControl mode={summary.intake} />}
			</div>

			{summary && <SummaryPanel summary={summary} />}

			<div className="mt-6 flex flex-wrap gap-2">
				<Select value={status} onValueChange={(value) => setStatus(value as StatusChoice)}>
					<SelectTrigger className="w-44" aria-label="Status">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value={ACTIVE}>Active (not ended)</SelectItem>
						<SelectItem value={ALL}>All statuses</SelectItem>
						{WORKFLOW_STATUSES.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}
					</SelectContent>
				</Select>
				<Select value={type} onValueChange={setType}>
					<SelectTrigger className="w-56" aria-label="Type">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value={ALL}>All types</SelectItem>
						{KNOWN_WORKFLOW_TYPES.map((value) => (
							<SelectItem key={value} value={value}>{workflowTypeLabel(value)}</SelectItem>
						))}
					</SelectContent>
				</Select>
				<Input
					value={clusterText}
					onChange={(event) => setClusterText(event.target.value)}
					placeholder="Cluster id (clu-…)"
					aria-label="Cluster"
					className="w-56"
				/>
			</div>

			<div className="mt-4">
				{rows && !!error && <RefreshFailed />}
				{isLoading
					? <p className="text-sm text-muted-foreground">Loading workflows…</p>
					: isError && !rows
					? <p className="text-sm text-destructive">{describeError(error).message}</p>
					: !rows?.length
					? <p className="text-sm text-muted-foreground">No workflows match these filters.</p>
					: (
						<>
							<p className="mb-2 text-xs text-muted-foreground">
								{rows.length >= LIST_PAGE_SIZE
									? `The newest ${rows.length} workflows; narrow the filters to see older ones`
									: `${rows.length === 1 ? '1 workflow' : `${rows.length} workflows`}, newest first`}
							</p>
							<div className="overflow-x-auto">
								<Table className="[&_td]:px-3 [&_td]:py-2 [&_td]:align-top [&_th]:px-3">
									<TableHeader>
										<TableRow>
											<TableHead>Workflow</TableHead>
											<TableHead>Status</TableHead>
											<TableHead>Step</TableHead>
											<TableHead>Cluster</TableHead>
											<TableHead>Node</TableHead>
											<TableHead>Created</TableHead>
											<TableHead>Updated</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{rows.map((row) => (
											<TableRow key={row.id}>
												<TableCell>
													<Link
														to="/admin/workflows/$workflowId"
														params={{ workflowId: row.id }}
														className="font-mono text-xs underline underline-offset-2"
													>
														{row.id}
													</Link>
													<div className="text-xs text-muted-foreground">{workflowTypeLabel(row.type)}</div>
												</TableCell>
												<TableCell>
													<WorkflowStatusBadge row={row} />
												</TableCell>
												<TableCell className="font-mono text-xs">{row.step ?? '—'}</TableCell>
												<TableCell className="font-mono text-xs">{row.clusterId ?? '—'}</TableCell>
												<TableCell className="text-xs">{row.owner?.node ?? '—'}</TableCell>
												<TableCell className="text-xs">
													<Timestamp value={row.createdAt} />
												</TableCell>
												<TableCell className="text-xs">
													<Timestamp value={row.updatedAt} />
												</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							</div>
						</>
					)}
			</div>
		</div>
	);
}
