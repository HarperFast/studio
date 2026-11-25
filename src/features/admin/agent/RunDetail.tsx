import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
	EvidenceEntry,
	Finding,
	isOpenRun,
	RunDetail,
	runDetailQueryOptions,
} from '@/features/admin/agent/agentAdminApi';
import {
	CancelRunButton,
	ConfidenceLabel,
	EvidenceStatusLabel,
	formatDuration,
	LoadFailed,
	runCostLabel,
	runDuration,
	RunStatusLabel,
	ScopeCell,
	stageLabel,
	triggerLabel,
	VerdictLabel,
} from '@/features/admin/agent/components/AgentBits';
import { WatchTable } from '@/features/admin/agent/components/SpendAndWatches';
import { DetailRow, RefreshFailed, Timestamp } from '@/features/admin/workflows/components/WorkflowBits';
import { useStaffPermission } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { ArrowLeftIcon, ChevronRightIcon } from 'lucide-react';
import { ReactNode, useId, useState } from 'react';

function Section({ title, children }: { title: string; children: ReactNode }) {
	return (
		<section aria-label={title} className="rounded-xl border bg-card p-4 sm:p-6">
			<h2 className="text-base font-semibold">{title}</h2>
			<div className="mt-4">{children}</div>
		</section>
	);
}

/** Text is rendered only once asked for: a brief can be hundreds of KiB, and the page re-renders on every poll. */
function ExpandableText({ label, text }: { label: string; text?: string | null }) {
	const [open, setOpen] = useState(false);
	if (!text) { return <span className="text-xs text-muted-foreground">No text kept.</span>; }
	return (
		<div>
			<Button variant="outline" size="sm" aria-expanded={open} onClick={() => setOpen(!open)}>
				{open ? `Hide ${label}` : `Show ${label}`}
			</Button>
			{open && (
				<pre
					aria-label={label}
					className="mt-2 max-h-[32rem] overflow-auto rounded-lg border bg-muted/40 p-3 text-xs leading-relaxed whitespace-pre-wrap break-words"
				>
					{text}
				</pre>
			)}
		</div>
	);
}

function formatBytes(bytes?: number | null): string {
	if (bytes === null || bytes === undefined) { return '—'; }
	if (bytes < 1024) { return `${bytes} B`; }
	if (bytes < 1024 * 1024) { return `${(bytes / 1024).toFixed(1)} KiB`; }
	return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}

function EvidenceRow({ entry }: { entry: EvidenceEntry }) {
	const [open, setOpen] = useState(false);
	const detailId = useId();
	const name = entry.name || entry.id;
	const hasDistinctId = name !== entry.id;
	const expandable = Boolean(entry.text || entry.reason || hasDistinctId);
	const label = `${name} ${entry.text ? 'text' : 'details'}`;
	return (
		<>
			<TableRow>
				<TableCell className="py-3 pr-4">
					{expandable
						? (
							<button
								type="button"
								aria-label={`${open ? 'Hide' : 'Show'} ${label}`}
								aria-expanded={open}
								aria-controls={open ? detailId : undefined}
								onClick={() => setOpen(!open)}
								className="group flex items-center gap-2 rounded-sm text-left text-sm font-medium hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
							>
								<ChevronRightIcon
									aria-hidden="true"
									className={`size-3.5 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-90' : ''}`}
								/>
								<span className="underline-offset-4 group-hover:underline">{name}</span>
							</button>
						)
						: (
							<span className="flex items-center gap-2 text-sm font-medium">
								<span aria-hidden="true" className="size-3.5 shrink-0" />
								{name}
							</span>
						)}
				</TableCell>
				<TableCell className="py-3 pr-4">
					<EvidenceStatusLabel status={entry.status} />
				</TableCell>
				<TableCell className="py-3 pr-4 text-xs text-muted-foreground">{entry.coverage ?? '—'}</TableCell>
				<TableCell className="py-3 pr-4 text-right tabular-nums text-xs">{formatBytes(entry.bytes)}</TableCell>
				<TableCell className="py-3 text-right tabular-nums text-xs text-muted-foreground">
					{entry.durationMs === null || entry.durationMs === undefined ? '—' : formatDuration(entry.durationMs)}
				</TableCell>
			</TableRow>
			{open && (
				<TableRow className="bg-muted/20">
					<TableCell colSpan={5} className="p-4 whitespace-normal">
						<div id={detailId} className="space-y-3">
							{hasDistinctId && <div className="break-all font-mono text-xs text-muted-foreground">{entry.id}</div>}
							{entry.reason && <p className="text-sm leading-relaxed">{entry.reason}</p>}
							{entry.text && (
								<pre
									aria-label={`${name} text`}
									className="max-h-[32rem] overflow-auto rounded-lg bg-muted/40 p-3 text-xs leading-relaxed whitespace-pre-wrap break-words"
								>{entry.text}</pre>
							)}
						</div>
					</TableCell>
				</TableRow>
			)}
		</>
	);
}

function FindingView({ finding }: { finding: Finding }) {
	return (
		<div className="space-y-6 text-sm leading-relaxed">
			<div className="space-y-3">
				<VerdictLabel verdict={finding.triage?.verdict} />
				<p className="text-[15px] leading-[1.75]">{finding.triage?.summary}</p>
			</div>
			{finding.nextStep && (
				<div className="rounded-lg border-l-2 border-foreground/50 bg-muted/30 px-4 py-3">
					<h3 className="mb-1 text-xs font-semibold">Next step</h3>
					<p>{finding.nextStep}</p>
				</div>
			)}
			{!!finding.hypotheses?.length && (
				<div>
					<h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
						Hypotheses, most likely first
					</h3>
					<ol className="space-y-3">
						{finding.hypotheses.map((hypothesis, index) => (
							<li key={index} className="rounded-lg border p-4">
								<div className="mb-3 flex items-center justify-between gap-3">
									<span className="text-xs font-medium text-muted-foreground">
										{String(index + 1).padStart(2, '0')}
									</span>
									<ConfidenceLabel confidence={hypothesis.confidence} />
								</div>
								<p>{hypothesis.cause}</p>
								{!!hypothesis.evidence?.length && (
									<div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
										<span>Evidence</span>
										{hypothesis.evidence.map((id) => (
											<span key={id} className="rounded bg-muted px-1.5 py-0.5 font-mono">{id}</span>
										))}
									</div>
								)}
								{!!hypothesis.against?.length && (
									<div className="mt-2 text-xs text-muted-foreground">
										Against: <span className="font-mono">{hypothesis.against.join(', ')}</span>
									</div>
								)}
							</li>
						))}
					</ol>
				</div>
			)}
			{!!finding.captureBeforeRestart?.length && (
				<div>
					<h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
						Capture before a restart
					</h3>
					<ul className="list-disc space-y-3 pl-5">
						{finding.captureBeforeRestart.map((item, index) => <li key={index}>{item}</li>)}
					</ul>
				</div>
			)}
			{!!finding.rejected?.length && (
				<details className="border-t pt-4">
					<summary className="cursor-pointer text-sm font-medium">
						Ruled out <span className="ml-2 text-xs text-muted-foreground">{finding.rejected.length}</span>
					</summary>
					<ul className="mt-3 list-disc space-y-3 pl-5 text-muted-foreground">
						{finding.rejected.map((item, index) => <li key={index}>{item.cause}: {item.reason}</li>)}
					</ul>
				</details>
			)}
		</div>
	);
}

function blindSpotsOf(run: RunDetail): string[] {
	return [...new Set([...(run.blindSpots ?? []), ...(run.finding?.blindSpots ?? [])])];
}

function RunView({ run, canCancel }: { run: RunDetail; canCancel: boolean }) {
	const trigger = run.trigger ?? {};
	const blindSpots = blindSpotsOf(run);
	return (
		<div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_15rem]">
			<div className="min-w-0 space-y-6">
				<Section title="Finding">
					{run.finding
						? <FindingView finding={run.finding} />
						: <p className="text-sm text-muted-foreground">No finding {run.finishedAt ? 'was written.' : 'yet.'}</p>}
				</Section>

				<Section title="Blind spots">
					{blindSpots.length
						? (
							<ul className="list-disc space-y-1 pl-5 text-sm">
								{blindSpots.map((spot) => <li key={spot}>{spot}</li>)}
							</ul>
						)
						: <p className="text-sm text-muted-foreground">None recorded.</p>}
				</Section>

				<Section title="Evidence">
					{run.evidence?.length
						? (
							<div className="overflow-x-auto">
								<Table className="min-w-[32rem] [&_th]:text-[11px] [&_th]:font-medium [&_th]:uppercase [&_th]:tracking-wider [&_th]:text-muted-foreground">
									<TableHeader>
										<TableRow>
											<TableHead className="pr-4">Source</TableHead>
											<TableHead className="pr-4">Status</TableHead>
											<TableHead className="pr-4">Coverage</TableHead>
											<TableHead className="pr-4 text-right">Size</TableHead>
											<TableHead className="text-right">Time</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{run.evidence.map((entry) => <EvidenceRow key={entry.id} entry={entry} />)}
									</TableBody>
								</Table>
							</div>
						)
						: <p className="text-sm text-muted-foreground">No evidence {run.finishedAt ? 'was read.' : 'read yet.'}</p>}
				</Section>

				<Section title="Brief the model saw">
					<ExpandableText label="brief" text={run.brief} />
				</Section>

				<Section title="Open watches on this cluster">
					{run.watches?.length
						? <WatchTable watches={run.watches} />
						: <p className="text-sm text-muted-foreground">No watch is open.</p>}
				</Section>
			</div>
			<aside className="min-w-0 space-y-6">
				<section aria-label="Run details" className="rounded-xl border bg-card/60 p-4 sm:p-6">
					<h2 className="mb-5 text-xs font-medium uppercase tracking-wider text-muted-foreground">Run details</h2>
					<dl className="grid grid-cols-2 gap-4 text-sm lg:grid-cols-1">
						<DetailRow label="Cluster">
							<ScopeCell row={run} />
						</DetailRow>
						<DetailRow label="Created">
							<Timestamp value={run.createdAt} />
						</DetailRow>
						<DetailRow label="Duration">{runDuration(run)}</DetailRow>
						<DetailRow label="Cost">
							{runCostLabel(run)}
						</DetailRow>
						<DetailRow label="Started by">{run.startedBy ?? '—'}</DetailRow>
						<DetailRow label="Deadline">
							<Timestamp value={run.deadline} />
						</DetailRow>
						<DetailRow label="Finished">
							<Timestamp value={run.finishedAt} />
						</DetailRow>
					</dl>
					{canCancel && isOpenRun(run) && (
						<div className="mt-4">
							<CancelRunButton run={run} />
						</div>
					)}
					{run.error && <p role="alert" className="mt-4 text-sm text-destructive">{run.error}</p>}
				</section>
				<Section title="Trigger">
					<dl className="grid grid-cols-1 gap-4 text-sm">
						<DetailRow label="Kind">{triggerLabel(trigger.kind ?? run.triggerKind)}</DetailRow>
						{trigger.operation && <DetailRow label="Operation">{trigger.operation}</DetailRow>}
						{trigger.ref && (
							<DetailRow label="Reference">
								<span className="font-mono text-xs">{trigger.ref}</span>
							</DetailRow>
						)}
						{trigger.windowMinutes != null && <DetailRow label="Window">{trigger.windowMinutes} minutes</DetailRow>}
						{trigger.by && <DetailRow label="By">{trigger.by}</DetailRow>}
						{trigger.reason && <DetailRow label="Reason">{trigger.reason}</DetailRow>}
					</dl>
				</Section>
			</aside>
		</div>
	);
}

export function RunDetailPage() {
	const { runId } = useParams({ strict: false }) as { runId: string };
	const canCancel = useStaffPermission('agent:run');
	const { data, error, isLoading } = useQuery(runDetailQueryOptions(runId));

	return (
		<div>
			<Link
				to="/admin/agent"
				className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
			>
				<ArrowLeftIcon className="size-4" />Agent
			</Link>
			<div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
				<h1 className="text-2xl font-semibold tracking-tight">Investigation</h1>
				{data && <RunStatusLabel status={data.status} />}
				{data && isOpenRun(data) && <span className="text-xs text-muted-foreground">{stageLabel(data.stage)}</span>}
			</div>
			<p className="mt-1.5 break-all font-mono text-xs text-muted-foreground">{runId}</p>
			{isLoading
				? <p className="mt-6 text-sm text-muted-foreground">Loading run…</p>
				: !data
				? (
					<div className="mt-6">
						<LoadFailed what="this run" error={error} />
					</div>
				)
				: (
					<>
						{error && (
							<div className="mt-4">
								<RefreshFailed error={error} />
							</div>
						)}
						<RunView run={data} canCancel={canCancel} />
					</>
				)}
		</div>
	);
}
