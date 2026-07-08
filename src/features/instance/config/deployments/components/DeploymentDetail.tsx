import { Loading } from '@/components/Loading';
import { Separator } from '@/components/ui/separator';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { DeployProgress } from '@/features/instance/applications/components/DeployProgress/DeployProgress';
import { useDeploymentStream } from '@/features/instance/applications/components/DeployProgress/useDeploymentStream';
import { useSupportsDeploymentSSE } from '@/features/instance/applications/hooks/useSupportsDeploymentSSE';
import { getDeploymentQueryOptions, getDeploymentStream } from '@/integrations/api/instance/deployments/getDeployment';
import {
	Deployment,
	deploymentErrorText,
	isTerminalDeploymentStatus,
} from '@/integrations/api/instance/deployments/types';
import { humanFileSize } from '@/lib/humanFileSize';
import { translateSecondsToAgo } from '@/lib/translateSecondsToAgo';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { DeploymentStatusBadge } from './deploymentStatusBadge';

function Field({ label, value }: { label: string; value: React.ReactNode }) {
	if (value === undefined || value === null || value === '') {
		return null;
	}
	return (
		<div className="flex flex-col gap-0.5">
			<span className="text-xs text-muted-foreground">{label}</span>
			<span className="break-words text-sm">{value}</span>
		</div>
	);
}

function timestamp(ms?: number) {
	return ms ? translateSecondsToAgo((Date.now() - ms) / 1000, ms) : undefined;
}

export function DeploymentDetail({ deploymentId }: { deploymentId: string }) {
	const instanceParams = useInstanceClientIdParams();
	const sseSupported = useSupportsDeploymentSSE();
	const queryClient = useQueryClient();
	const stream = useDeploymentStream();

	const { data: deployment, isLoading, error } = useQuery(
		// Poll while the deploy is active; the refetchInterval stops itself at a terminal
		// status. This is the correctness backbone — the SSE tail below only adds live
		// phase/log granularity on top.
		getDeploymentQueryOptions({ ...instanceParams, deploymentId, pollWhileActive: true }),
	);

	const isActive = !!deployment && !isTerminalDeploymentStatus(deployment.status);

	useEffect(() => {
		if (!sseSupported || !isActive) {
			return;
		}
		const controller = new AbortController();
		stream.reset();
		stream.markStarted();
		getDeploymentStream({
			connection: { id: instanceParams.entityId },
			deploymentId,
			signal: controller.signal,
			onEvent: stream.onEvent,
		})
			.then(() => stream.markSettled('success'))
			.catch(() => {
				if (!controller.signal.aborted) {
					// SSE dropped — polling (above) remains the source of truth.
					stream.markSettled('inconclusive');
				}
			})
			.finally(() => {
				if (!controller.signal.aborted) {
					void queryClient.invalidateQueries({
						queryKey: [instanceParams.entityId, 'get_deployment', deploymentId],
					});
				}
			});
		// Abort the tail on unmount (unlike the deploy modal, the detail view is transient).
		return () => controller.abort();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [sseSupported, isActive, deploymentId, instanceParams.entityId]);

	if (isLoading) {
		return <Loading className="flex h-full flex-col items-center justify-center" text="Loading deployment..." />;
	}
	if (error || !deployment) {
		return <div className="p-4 text-sm text-destructive">Could not load this deployment.</div>;
	}

	const showLiveProgress = isActive
		&& (stream.state.installLog.length > 0 || Object.keys(stream.state.phases).length > 0);

	return (
		<div className="flex flex-col gap-4 p-1">
			<div className="flex flex-wrap items-center gap-2">
				<h2 className="text-lg font-semibold">{deployment.project}</h2>
				<DeploymentStatusBadge status={deployment.status} />
				{deployment.phase && <span className="text-sm text-muted-foreground">{deployment.phase}</span>}
			</div>

			<div className="grid grid-cols-2 gap-3 md:grid-cols-3">
				<Field label="Deployment ID" value={<span className="font-mono text-xs">{deployment.deployment_id}</span>} />
				<Field label="User" value={deployment.user} />
				<Field label="Origin node" value={deployment.origin_node} />
				<Field label="Started" value={timestamp(deployment.started_at)} />
				<Field label="Completed" value={timestamp(deployment.completed_at)} />
				<Field label="Restart mode" value={deployment.restart_mode ?? undefined} />
				<Field label="Package" value={deployment.package_identifier ?? undefined} />
				<Field
					label="Payload size"
					value={deployment.payload_size != null ? humanFileSize(deployment.payload_size) : undefined}
				/>
				<Field
					label="Payload hash"
					value={deployment.payload_hash
						? <span className="font-mono text-xs">{deployment.payload_hash}</span>
						: undefined}
				/>
				<Field
					label="Restorable"
					value={deployment.restorable === undefined ? undefined : deployment.restorable ? 'Yes' : 'No'}
				/>
				<Field
					label="Rollback of"
					value={deployment.rollback_of
						? <span className="font-mono text-xs">{deployment.rollback_of}</span>
						: undefined}
				/>
			</div>

			{showLiveProgress && (
				<>
					<Separator />
					<DeployProgress state={stream.state} />
				</>
			)}

			{deployment.error && (
				<>
					<Separator />
					<div className="flex flex-col gap-1 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
						<span className="font-medium text-destructive">
							Error{typeof deployment.error.phase === 'string' && deployment.error.phase
								? ` during ${deployment.error.phase}`
								: ''}
							{typeof deployment.error.code === 'string' || typeof deployment.error.code === 'number'
								? ` (${deployment.error.code})`
								: ''}
						</span>
						<span className="break-words">{deploymentErrorText(deployment.error) ?? 'Unknown error'}</span>
					</div>
				</>
			)}

			{!!deployment.peer_results?.length && (
				<>
					<Separator />
					<div>
						<div className="mb-1 text-xs font-medium text-muted-foreground">Replication</div>
						<ul className="flex flex-col gap-1 text-sm">
							{deployment.peer_results.map((peer, i) => {
								const peerError = deploymentErrorText(peer.error);
								return (
									<li key={peer.node ?? i} className="flex items-center justify-between gap-2">
										<span className="truncate">{peer.node}</span>
										<span className={peer.status === 'failed' ? 'text-destructive' : 'text-success'}>
											{peer.status ?? 'ok'}
											{peerError ? `: ${peerError}` : ''}
										</span>
									</li>
								);
							})}
						</ul>
					</div>
				</>
			)}

			{!!deployment.event_log?.length && <DeploymentEventLog deployment={deployment} />}
		</div>
	);
}

function DeploymentEventLog({ deployment }: { deployment: Deployment }) {
	return (
		<>
			<Separator />
			<div>
				<div className="mb-1 text-xs font-medium text-muted-foreground">Activity</div>
				<ol className="flex flex-col gap-1 text-xs">
					{deployment.event_log!.map((entry, i) => (
						<li key={i} className="flex gap-2">
							<span className="shrink-0 text-muted-foreground">{new Date(entry.t).toLocaleTimeString()}</span>
							<span className="font-medium">{entry.event}</span>
							<span className="break-words text-muted-foreground">
								{typeof entry.data === 'string' ? entry.data : JSON.stringify(entry.data)}
							</span>
						</li>
					))}
				</ol>
			</div>
		</>
	);
}
