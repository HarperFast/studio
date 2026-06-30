import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scrollArea';
import { Separator } from '@/components/ui/separator';
import { DEPLOY_PHASE_ORDER } from '@/integrations/api/instance/applications/deployComponentStream';
import { cn } from '@/lib/cn';
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
export function DeployProgress({ state }: { state: DeploymentStreamState }) {
	const logEndRef = useRef<HTMLDivElement>(null);

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
							{state.installLog.map((entry, i) => (
								<div
									key={i}
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
							return (
								<li key={i} className="flex items-center justify-between gap-2">
									<span className="flex items-center gap-2">
										{failed
											? <XIcon className="size-4 text-destructive" />
											: <CheckIcon className="size-4 text-success" />}
										<span className="truncate">{peer.node ?? `node ${i + 1}`}</span>
									</span>
									{failed && peer.reason && <span className="truncate text-xs text-destructive">{peer.reason}</span>}
								</li>
							);
						})}
					</ul>
				</div>
			)}

			{phasesFailed && state.error && (
				<div className="flex items-start gap-2 text-sm text-destructive">
					<CircleIcon className="mt-0.5 size-4 shrink-0" />
					<span>{state.error}</span>
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
