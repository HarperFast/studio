import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scrollArea';
import { Separator } from '@/components/ui/separator';
import { deploymentRecordPath } from '@/features/instance/applications/hooks/useDeploymentRecordAction';
import { DEPLOY_PHASE_ORDER, STAGE_PHASE_ORDER } from '@/integrations/api/instance/applications/deployComponentStream';
import { CertificationDecision } from '@/integrations/api/instance/applications/deployOutcome';
import { RolloutNode, RolloutSnapshot } from '@/integrations/api/instance/applications/restartJob';
import { cn } from '@/lib/cn';
import { errorText } from '@/lib/errorText';
import { Link, useParams } from '@tanstack/react-router';
import {
	CheckIcon,
	CircleDashedIcon,
	CircleMinusIcon,
	Loader2Icon,
	ShieldCheckIcon,
	TriangleAlertIcon,
	XIcon,
} from 'lucide-react';
import { useEffect, useRef } from 'react';
import { DeployFailure } from './DeployFailure';
import {
	describeCertification,
	describeDecision,
	describeRolloutNode,
	describeUnfollowable,
} from './describeDeployOutcome';
import { DeploymentStreamState, PhaseStatus } from './useDeploymentStream';

const PHASE_LABELS: Record<string, string> = {
	prepare: 'Prepare',
	load: 'Load',
	replicate: 'Replicate',
	restart: 'Restart',
	success: 'Finish',
	staged: 'Staged',
};

/**
 * Phases Harper passed over: it sent nothing for them, and a later phase has already reported. Harper sends no
 * Load when it skips the validation load (harper `components/operations.js:467-473`, v5.3.2) and no Restart for a
 * deploy that does not restart (`operations.js:992-1013`), so drawing those as pending says they are still to come.
 */
function skippedPhases(order: readonly string[], phases: Record<string, PhaseStatus>): Set<string> {
	const skipped = new Set<string>();
	let laterReported = false;
	for (let i = order.length - 1; i >= 0; i--) {
		if (phases[order[i]]) {
			laterReported = true;
		} else if (laterReported) {
			skipped.add(order[i]);
		}
	}
	return skipped;
}

function PhaseIcon({ status, isCurrent, skipped }: { status?: PhaseStatus; isCurrent: boolean; skipped: boolean }) {
	if (skipped) {
		return <CircleMinusIcon className="size-4 text-muted-foreground" />;
	}
	if (status === 'done') {
		return <CheckIcon className="size-4 text-success" />;
	}
	if (status === 'error') {
		return <XIcon className="size-4 text-destructive" />;
	}
	if (status === 'start' || isCurrent) {
		return <Loader2Icon className="size-4 animate-spin text-primary" />;
	}
	return <CircleDashedIcon className="size-4 text-muted-foreground" />;
}

/** Renders live `deploy_component` progress: phase checklist, install log tail, peer results. */
export function DeployProgress({
	state,
	onNavigateAway,
	staging = false,
}: {
	state: DeploymentStreamState;
	/** Called when a guidance link navigates away — lets a hosting modal close itself first. */
	onNavigateAway?: () => void;
	staging?: boolean;
}) {
	const logEndRef = useRef<HTMLDivElement>(null);
	const params: { clusterId?: string; instanceId?: string; organizationId?: string } = useParams({ strict: false });

	useEffect(() => {
		logEndRef.current?.scrollIntoView({ block: 'end' });
	}, [state.installLog.length]);

	const phasesFailed = state.lifecycle === 'error';
	const phaseOrder = staging ? STAGE_PHASE_ORDER : DEPLOY_PHASE_ORDER;
	const skipped = skippedPhases(phaseOrder, state.phases);

	return (
		<div className="flex flex-col gap-4">
			<ol className="flex flex-col gap-2">
				{phaseOrder.map((phase) => {
					const status = state.phases[phase];
					const isCurrent = state.currentPhase === phase && status !== 'done';
					const isSkipped = skipped.has(phase);
					return (
						<li key={phase} className="flex items-center gap-2 text-sm">
							<PhaseIcon status={status} isCurrent={isCurrent} skipped={isSkipped} />
							<span className={cn(status ? 'text-foreground' : 'text-muted-foreground')}>
								{PHASE_LABELS[phase] ?? phase}
							</span>
							{isSkipped && <span className="text-xs text-muted-foreground">skipped</span>}
						</li>
					);
				})}
			</ol>

			{state.installLog.length > 0 && (
				<div>
					<Separator className="mb-2" />
					<div className="mb-1 text-xs font-medium text-muted-foreground">Install output</div>
					<ScrollArea className="h-40 rounded-md border bg-muted/40">
						<pre className="whitespace-pre-wrap break-words p-2 font-mono text-xs leading-relaxed">
							{state.installLog.map((entry) => (
								<div
									key={entry.id}
									className={cn(entry.stream === 'stderr' && 'text-destructive')}
								>
									{entry.line}
								</div>
							))}
							<div ref={logEndRef} />
						</pre>
					</ScrollArea>
				</div>
			)}

			{state.peers.length > 0 && (
				<div>
					<Separator className="mb-2" />
					<div className="mb-1 text-xs font-medium text-muted-foreground">Replication</div>
					<ul className="flex flex-col gap-1 text-sm">
						{state.peers.map((peer, i) => {
							const failed = peer.status === 'failed';
							// Raw replicator results carry failure detail as either a structured
							// `error` or a stringified `reason` — normalize both to text (#1426).
							const reason = errorText(peer.error ?? peer.reason);
							return (
								<li key={i} className="flex items-center justify-between gap-2">
									<span className="flex items-center gap-2">
										{failed
											? <XIcon className="size-4 text-destructive" />
											: <CheckIcon className="size-4 text-success" />}
										<span className="truncate">{peer.node ?? `node ${i + 1}`}</span>
									</span>
									{failed && reason && <span className="truncate text-xs text-destructive">{reason}</span>}
								</li>
							);
						})}
					</ul>
				</div>
			)}

			{!!state.warnings?.length && (
				<div>
					<Separator className="mb-2" />
					<div className="mb-1 text-xs font-medium text-muted-foreground">Warnings</div>
					<ul className="flex flex-col gap-1 text-sm">
						{state.warnings.map((warning, i) => (
							<li key={i} className="flex items-start gap-2">
								<TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-amber-500" />
								<span className="break-words">{warning}</span>
							</li>
						))}
					</ul>
				</div>
			)}

			{state.certification && <CertificationLine certification={state.certification} />}

			{state.rollout && <RolloutSection rollout={state.rollout} />}

			{phasesFailed && state.decision && <DecisionBlock decision={state.decision} />}

			{phasesFailed && state.error && !state.decision && (
				<DeployFailure message={state.error} onNavigateAway={onNavigateAway} />
			)}

			{state.lifecycle === 'inconclusive' && !state.rollout && (
				<Badge variant="warning" className="self-start">
					Live updates ended early — verifying…
				</Badge>
			)}

			{state.deploymentId && (
				<Link
					to={deploymentRecordPath(params, state.deploymentId)}
					onClick={onNavigateAway}
					className="self-start text-sm underline"
				>
					View this deployment's record
				</Link>
			)}
		</div>
	);
}

function CertificationLine({ certification }: { certification: string }) {
	const { label, detail, certified } = describeCertification(certification);
	return (
		<div className="flex items-start gap-2 text-sm">
			{certified
				? <ShieldCheckIcon className="mt-0.5 size-4 shrink-0 text-success" />
				: <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-amber-500" />}
			<span>
				<span className="font-medium">{label}</span>
				{detail && <span className="text-muted-foreground">{' '}{detail}</span>}
			</span>
		</div>
	);
}

function DecisionBlock({ decision }: { decision: CertificationDecision }) {
	const { title, reason, outcome } = describeDecision(decision);
	return (
		<div className="flex flex-col gap-1 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
			<span className="font-medium text-destructive">{title}</span>
			{reason && <span className="break-words">{reason}</span>}
			{outcome && <span>{outcome}</span>}
			<span className="text-muted-foreground">No other node received it.</span>
		</div>
	);
}

function RolloutSection({ rollout }: { rollout: RolloutSnapshot }) {
	const unfollowable = describeUnfollowable(rollout);
	if (rollout.state === 'complete' && rollout.nodes.length === 0) {
		return null;
	}
	return (
		<div>
			<Separator className="mb-2" />
			<div className="mb-1 text-xs font-medium text-muted-foreground">Other nodes</div>
			{rollout.state === 'following' && (
				<div className="flex items-center gap-2 text-sm">
					<Loader2Icon className="size-4 animate-spin text-primary" />
					<span>Rolling out to the other nodes, one at a time…</span>
				</div>
			)}
			{!!rollout.nodes.length && (
				<ul className="flex flex-col gap-1 text-sm">
					{rollout.nodes.map((node, i) => {
						const { label, detail } = describeRolloutNode(node);
						return (
							<li key={`${node.node}-${i}`} className="flex flex-col gap-0.5">
								<span className="flex items-center gap-2">
									<RolloutNodeIcon outcome={node.outcome} />
									<span className="truncate">{node.node}</span>
									<span className="text-xs text-muted-foreground">{label}</span>
								</span>
								{detail && (
									<span className={cn('break-words pl-6 text-xs', node.outcome === 'failed' && 'text-destructive')}>
										{detail}
									</span>
								)}
							</li>
						);
					})}
				</ul>
			)}
			{rollout.state === 'failed' && rollout.message && (
				<div className="mt-1 break-words text-sm text-destructive">{rollout.message}</div>
			)}
			{unfollowable && (
				<div className="flex items-start gap-2 text-sm">
					<TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-amber-500" />
					<span>{unfollowable}</span>
				</div>
			)}
		</div>
	);
}

function RolloutNodeIcon({ outcome }: { outcome: RolloutNode['outcome'] }) {
	if (outcome === 'failed') {
		return <XIcon className="size-4 shrink-0 text-destructive" />;
	}
	if (outcome === 'unconfirmed') {
		return <TriangleAlertIcon className="size-4 shrink-0 text-amber-500" />;
	}
	return <CheckIcon className="size-4 shrink-0 text-success" />;
}
