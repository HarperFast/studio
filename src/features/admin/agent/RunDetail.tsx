import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EvidenceEntry, Finding, RunDetail, runDetailQueryOptions } from '@/features/admin/agent/agentAdminApi';
import {
	CancelRunButton,
	formatDuration,
	formatUsd,
	LoadFailed,
	runCostLabel,
	runDuration,
	RunStatusBadge,
	stageLabel,
	triggerLabel,
	VerdictBadge,
} from '@/features/admin/agent/components/AgentBits';
import { WatchTable } from '@/features/admin/agent/components/SpendAndWatches';
import { DetailRow, RefreshFailed, Timestamp } from '@/features/admin/workflows/components/WorkflowBits';
import { useStaffPermission } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { ArrowLeftIcon } from 'lucide-react';
import { ReactNode, useState } from 'react';

function Section({ title, children }: { title: string; children: ReactNode }) {
	return (
		<section aria-label={title} className="mt-8">
			<h2 className="text-lg font-light">{title}</h2>
			<div className="mt-2">{children}</div>
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
	return (
		<>
			<TableRow>
				<TableCell>
					<div className="flex flex-col">
						<span className="text-sm">{entry.name ?? entry.id}</span>
						<span className="font-mono text-xs text-muted-foreground">{entry.id}</span>
					</div>
				</TableCell>
				<TableCell>
					<Badge variant={entry.status === 'ok' ? 'success' : 'warning'}>
						{entry.status === 'blind_spot' ? 'blind spot' : entry.status ?? '—'}
					</Badge>
				</TableCell>
				<TableCell>{entry.coverage ?? '—'}</TableCell>
				<TableCell className="max-w-sm whitespace-normal text-xs">{entry.reason ?? ''}</TableCell>
				<TableCell className="tabular-nums text-xs">{formatBytes(entry.bytes)}</TableCell>
				<TableCell className="tabular-nums text-xs">
					{entry.durationMs === null || entry.durationMs === undefined ? '—' : formatDuration(entry.durationMs)}
				</TableCell>
			</TableRow>
			{entry.text && (
				<TableRow>
					<TableCell colSpan={6} className="whitespace-normal">
						<ExpandableText label={`${entry.name ?? entry.id} text`} text={entry.text} />
					</TableCell>
				</TableRow>
			)}
		</>
	);
}

function FindingView({ finding }: { finding: Finding }) {
	return (
		<div className="space-y-4 text-sm">
			<div className="flex flex-wrap items-center gap-2">
				<VerdictBadge verdict={finding.triage?.verdict} />
				<span>{finding.triage?.summary}</span>
			</div>
			{!!finding.hypotheses?.length && (
				<div>
					<h3 className="text-xs font-medium text-muted-foreground">Hypotheses, most likely first</h3>
					<ol className="mt-1 list-decimal space-y-2 pl-5">
						{finding.hypotheses.map((hypothesis, index) => (
							<li key={index}>
								<span>{hypothesis.cause}</span> <Badge variant="outline">{hypothesis.confidence}</Badge>
								{!!hypothesis.evidence?.length && (
									<div className="text-xs text-muted-foreground">
										Evidence: <span className="font-mono">{hypothesis.evidence.join(', ')}</span>
									</div>
								)}
								{!!hypothesis.against?.length && (
									<div className="text-xs text-muted-foreground">
										Against: <span className="font-mono">{hypothesis.against.join(', ')}</span>
									</div>
								)}
							</li>
						))}
					</ol>
				</div>
			)}
			{!!finding.rejected?.length && (
				<div>
					<h3 className="text-xs font-medium text-muted-foreground">Ruled out</h3>
					<ul className="mt-1 list-disc space-y-1 pl-5">
						{finding.rejected.map((item, index) => <li key={index}>{item.cause}: {item.reason}</li>)}
					</ul>
				</div>
			)}
			{!!finding.captureBeforeRestart?.length && (
				<div>
					<h3 className="text-xs font-medium text-muted-foreground">Capture before a restart</h3>
					<ul className="mt-1 list-disc space-y-1 pl-5">
						{finding.captureBeforeRestart.map((item, index) => <li key={index}>{item}</li>)}
					</ul>
				</div>
			)}
			{finding.nextStep && (
				<div>
					<h3 className="text-xs font-medium text-muted-foreground">Next step</h3>
					<p className="mt-1">{finding.nextStep}</p>
				</div>
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
		<>
			<dl className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
				<DetailRow label="Status">
					<span className="flex items-center gap-2">
						<RunStatusBadge status={run.status} />
						<span className="text-xs text-muted-foreground">{stageLabel(run.stage)}</span>
					</span>
				</DetailRow>
				<DetailRow label="Cluster">
					<span className="font-mono text-xs">{run.clusterId}</span>
					{run.organizationId && <div className="font-mono text-xs text-muted-foreground">{run.organizationId}</div>}
				</DetailRow>
				<DetailRow label="Created">
					<Timestamp value={run.createdAt} />
				</DetailRow>
				<DetailRow label="Duration">{runDuration(run)}</DetailRow>
				<DetailRow label="Cost">
					{runCostLabel(run)}
					{run.cost?.spendKnown === false && run.finishedAt && (
						<div className="text-xs text-muted-foreground">
							Spend not reported; up to {formatUsd(run.cost.reservedUsd)}
						</div>
					)}
				</DetailRow>
				<DetailRow label="Started by">{run.startedBy ?? '—'}</DetailRow>
				<DetailRow label="Deadline">
					<Timestamp value={run.deadline} />
				</DetailRow>
				<DetailRow label="Finished">
					<Timestamp value={run.finishedAt} />
				</DetailRow>
			</dl>
			{canCancel && (
				<div className="mt-4">
					<CancelRunButton run={run} />
				</div>
			)}
			{run.error && <p role="alert" className="mt-4 text-sm text-destructive">{run.error}</p>}

			<Section title="Trigger">
				<dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
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

			<Section title="Finding">
				{run.finding
					? <FindingView finding={run.finding} />
					: <p className="text-sm text-muted-foreground">No finding {run.finishedAt ? 'was written.' : 'yet.'}</p>}
			</Section>

			<Section title="Blind spots">
				{blindSpots.length
					? <ul className="list-disc space-y-1 pl-5 text-sm">{blindSpots.map((spot) => <li key={spot}>{spot}</li>)}</ul>
					: <p className="text-sm text-muted-foreground">None recorded.</p>}
			</Section>

			<Section title="Evidence">
				{run.evidence?.length
					? (
						<div className="overflow-x-auto">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Read</TableHead>
										<TableHead>Status</TableHead>
										<TableHead>Coverage</TableHead>
										<TableHead>Reason</TableHead>
										<TableHead>Size</TableHead>
										<TableHead>Took</TableHead>
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
		</>
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
			<h1 className="mt-2 text-2xl font-light">
				Run <span className="font-mono text-lg">{runId}</span>
			</h1>
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
