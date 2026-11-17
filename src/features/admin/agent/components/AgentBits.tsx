import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { isOpenRun, RunStage, RunSummary, useCancelRunMutation, Verdict } from '@/features/admin/agent/agentAdminApi';
import { describeError } from '@/react-query/queryClient';

type BadgeVariant = 'success' | 'warning' | 'secondary' | 'outline' | 'destructive';

const STATUS_BADGE: Record<string, BadgeVariant> = {
	pending: 'secondary',
	running: 'warning',
	completed: 'success',
	error: 'destructive',
	cancelled: 'outline',
	expired: 'outline',
};

const VERDICT_BADGE: Record<Verdict, BadgeVariant> = {
	healthy: 'success',
	degraded: 'warning',
	down: 'destructive',
	unknown: 'outline',
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
	failed_operation: 'Failed operation',
	version_upgrade: 'Version upgrade',
	bulk_upgrade: 'Bulk upgrade',
};

export const triggerLabel = (kind: string) => TRIGGER_LABEL[kind] ?? kind;
export const stageLabel = (stage: string) => STAGE_LABEL[stage as RunStage] ?? stage;

export function RunStatusBadge({ status }: { status: string }) {
	return <Badge variant={STATUS_BADGE[status] ?? 'outline'}>{status}</Badge>;
}

export function VerdictBadge({ verdict }: { verdict?: string | null }) {
	if (!verdict) { return <span className="text-muted-foreground">—</span>; }
	return <Badge variant={VERDICT_BADGE[verdict as Verdict] ?? 'outline'}>{verdict}</Badge>;
}

export function formatUsd(value: number | null | undefined): string {
	if (value === null || value === undefined || !Number.isFinite(value)) { return '—'; }
	return `$${value.toFixed(value !== 0 && Math.abs(value) < 0.1 ? 4 : 2)}`;
}

export function runCostLabel(run: Pick<RunSummary, 'cost'>): string {
	const cost = run.cost;
	if (!cost) { return '—'; }
	if (cost.spendKnown) { return formatUsd(cost.spentUsd); }
	return cost.reservedUsd ? `${formatUsd(cost.reservedUsd)} reserved` : '—';
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
