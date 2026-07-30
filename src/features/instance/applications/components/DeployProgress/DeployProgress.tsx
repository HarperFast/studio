import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scrollArea';
import { Separator } from '@/components/ui/separator';
import { DEPLOY_PHASE_ORDER } from '@/integrations/api/instance/applications/deployComponentStream';
import { cn } from '@/lib/cn';
import { errorText } from '@/lib/errorText';
import { buildAbsoluteLinkToPage } from '@/lib/urls/buildAbsoluteLinkToPage';
import { Link, useParams } from '@tanstack/react-router';
import { CheckIcon, CircleDashedIcon, CircleIcon, Loader2Icon, XIcon } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { DeploymentStreamState, PhaseStatus } from './useDeploymentStream';

const PHASE_LABELS: Record<string, string> = {
	prepare: 'Prepare',
	load: 'Load',
	replicate: 'Replicate',
	restart: 'Restart',
	success: 'Finish',
};

/**
 * A deploy that failed because the *instance* couldn't reach a private repository over SSH is
 * fixed in Config > SSH Keys (install a key, grant it access to the repo, add the git host to
 * `known_hosts`), so link the user there instead of leaving them to find it. Harper's message
 * already spells out the remediation, and this UI is now the only place the failure surfaces:
 * it's an instance configuration state, not a Studio bug, so `shouldKeepEvent` drops the RUM
 * event (which also kept the customer's private repo URL out of Error Tracking).
 */
const SSH_ACCESS_FAILURE = /Failed to deploy private repository\b|SSH access failed/i;

function PhaseIcon({ status, isCurrent }: { status?: PhaseStatus; isCurrent: boolean }) {
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
}: {
	state: DeploymentStreamState;
	/** Called when a guidance link navigates away — lets a hosting modal close itself first. */
	onNavigateAway?: () => void;
}) {
	const logEndRef = useRef<HTMLDivElement>(null);
	const params: { clusterId?: string; instanceId?: string; organizationId?: string } = useParams({ strict: false });

	useEffect(() => {
		logEndRef.current?.scrollIntoView({ block: 'end' });
	}, [state.installLog.length]);

	const phasesFailed = state.lifecycle === 'error';

	return (
		<div className="flex flex-col gap-4">
			<ol className="flex flex-col gap-2">
				{DEPLOY_PHASE_ORDER.map((phase) => {
					const status = state.phases[phase];
					const isCurrent = state.currentPhase === phase && status !== 'done';
					return (
						<li key={phase} className="flex items-center gap-2 text-sm">
							<PhaseIcon status={status} isCurrent={isCurrent} />
							<span className={cn(status ? 'text-foreground' : 'text-muted-foreground')}>
								{PHASE_LABELS[phase] ?? phase}
							</span>
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

			{phasesFailed && state.error && (
				<div className="flex flex-col gap-2 text-sm text-destructive">
					<div className="flex items-start gap-2">
						<CircleIcon className="mt-0.5 size-4 shrink-0" />
						<span>{state.error}</span>
					</div>
					{SSH_ACCESS_FAILURE.test(state.error) && (
						<Link
							to={buildAbsoluteLinkToPage(params, 'config/ssh-keys')}
							onClick={onNavigateAway}
							className="self-start pl-6 underline"
						>
							Manage SSH keys
						</Link>
					)}
				</div>
			)}

			{state.lifecycle === 'inconclusive' && (
				<Badge variant="warning" className="self-start">
					Live updates ended early — verifying…
				</Badge>
			)}
		</div>
	);
}
