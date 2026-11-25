import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { isOpenRun, RunStage, RunSummary, useCancelRunMutation } from '@/features/admin/agent/agentAdminApi';
import { describeError } from '@/react-query/queryClient';
import { CircleCheckBigIcon, CircleHelpIcon, OctagonXIcon, TriangleAlertIcon } from 'lucide-react';

const STATUS_VARIANTS = {
	pending: 'secondary',
	running: 'warning',
	completed: 'success',
	error: 'destructive',
	cancelled: 'outline',
	expired: 'outline',
} as const;

const VERDICT_STYLES = {
	healthy: { icon: CircleCheckBigIcon, color: 'text-emerald-700 dark:text-emerald-300', fill: '' },
	degraded: { icon: TriangleAlertIcon, color: 'text-amber-700 dark:text-amber-300', fill: 'fill-amber-500/15' },
	down: { icon: OctagonXIcon, color: 'text-red-700 dark:text-red-300', fill: 'fill-red-500/20' },
	unknown: { icon: CircleHelpIcon, color: 'text-muted-foreground', fill: '' },
};

const STAGE_LABEL: Record<RunStage, string> = {
	admitted: 'Admitted',
	gathering: 'Gathering evidence',
	model: 'Waiting on the model',
	finding: 'Writing the finding',
	finished: 'Finished',
};

const TRIGGER_LABEL: Record<string, string> = {
	manual: 'Manual',
	scheduled_scan: 'Scheduled scan',
	control_plane_log: 'Control plane log',
	failed_operation: 'Failed operation',
	version_upgrade: 'Version upgrade',
	bulk_upgrade: 'Bulk upgrade',
};

export const triggerLabel = (kind: string) => TRIGGER_LABEL[kind] ?? kind;
export const stageLabel = (stage: string) => STAGE_LABEL[stage as RunStage] ?? stage;

export function RunStatusLabel({ status }: { status: string }) {
	return <Badge variant={STATUS_VARIANTS[status as keyof typeof STATUS_VARIANTS] ?? 'outline'}>{status}</Badge>;
}

/** A failed evidence read is a gap in what the agent saw, not a failed run, so anything but ok stays amber. */
export function EvidenceStatusLabel({ status }: { status?: string | null }) {
	if (!status) { return <span className="text-muted-foreground">—</span>; }
	return (
		<Badge variant={status === 'ok' ? 'success' : 'warning'}>{status === 'blind_spot' ? 'blind spot' : status}</Badge>
	);
}

export function WatchStateLabel({ firing }: { firing: boolean }) {
	return firing ? <Badge variant="destructive">firing</Badge> : <Badge variant="outline">quiet</Badge>;
}

export function VerdictLabel({ verdict, confidence }: { verdict?: string | null; confidence?: string | null }) {
	if (!verdict) { return <span className="text-muted-foreground">—</span>; }
	const { icon: Icon, color, fill } = VERDICT_STYLES[verdict as keyof typeof VERDICT_STYLES] ?? VERDICT_STYLES.unknown;
	return (
		<span className="inline-flex items-start gap-2.5">
			<Icon aria-hidden="true" className={`size-5 shrink-0 ${color} ${fill}`} />
			<span className="flex flex-col">
				<span className={`text-[13px] font-medium leading-5 ${color}`}>{verdict}</span>
				{confidence && <ConfidenceLabel confidence={confidence} />}
			</span>
		</span>
	);
}

export function ConfidenceLabel({ confidence }: { confidence: string }) {
	return <span className="text-[11px] font-normal leading-5 text-muted-foreground">{confidence} confidence</span>;
}

export function formatUsd(value: number | null | undefined): string {
	if (value === null || value === undefined || !Number.isFinite(value)) { return '—'; }
	return `$${value.toFixed(value !== 0 && Math.abs(value) < 0.1 ? 4 : 2)}`;
}

export function runCostLabel(run: Pick<RunSummary, 'cost' | 'status'>): string {
	const cost = run.cost;
	if (!cost) { return '—'; }
	if (cost.spendKnown) { return formatUsd(cost.spentUsd); }
	if (!cost.reservedUsd) { return '—'; }
	// A finished run no longer holds its reservation; it only bounds a spend that was never reported.
	return isOpenRun(run)
		? `${formatUsd(cost.reservedUsd)} reserved`
		: `unreported (up to ${formatUsd(cost.reservedUsd)})`;
}

export function formatDuration(ms: number): string {
	if (!Number.isFinite(ms) || ms < 0) { return '—'; }
	if (ms < 1000) { return `${Math.round(ms)} ms`; }
	const seconds = Math.round(ms / 1000);
	if (seconds < 60) { return `${seconds}s`; }
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) { return `${minutes}m ${seconds % 60}s`; }
	return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function runDuration(run: Pick<RunSummary, 'startedAt' | 'createdAt' | 'finishedAt'>): string {
	if (!run.finishedAt) { return '—'; }
	return formatDuration(Date.parse(run.finishedAt) - Date.parse(run.startedAt ?? run.createdAt));
}

/** Only for an open run, and only for staff who hold agent:run; the caller decides the latter. */
export function CancelRunButton({ run }: { run: Pick<RunSummary, 'id' | 'status'> }) {
	const { mutate, isPending, variables } = useCancelRunMutation();
	if (!isOpenRun(run)) { return null; }
	const pending = isPending && variables === run.id;
	return (
		<Button
			variant="outline"
			size="sm"
			disabled={pending}
			aria-label={`Cancel run ${run.id}`}
			onClick={() => mutate(run.id)}
		>
			{pending ? 'Cancelling…' : 'Cancel'}
		</Button>
	);
}

export function LoadFailed({ what, error }: { what: string; error: unknown }) {
	return (
		<p role="alert" className="text-sm text-destructive">
			Couldn't load {what}: {describeError(error).message}
		</p>
	);
}

function NamedId({ name, id }: { name?: string | null; id?: string | null }) {
	if (!id) { return null; }
	if (!name) { return <span className="font-mono text-xs">{id}</span>; }
	return (
		<span className="flex flex-col">
			<span className="text-sm">{name}</span>
			<span className="font-mono text-xs text-muted-foreground">{id}</span>
		</span>
	);
}

/** Names when central manager sends them, ids otherwise (a deleted cluster or organization answers no name). */
export function ScopeCell(
	{ row }: {
		row: {
			clusterId: string;
			clusterName?: string | null;
			organizationId?: string | null;
			organizationName?: string | null;
		};
	},
) {
	return (
		<div className="flex flex-col gap-1">
			<NamedId name={row.clusterName} id={row.clusterId} />
			<NamedId name={row.organizationName} id={row.organizationId} />
		</div>
	);
}
