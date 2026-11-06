import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { heldClusterWorkflowQueryOptions } from '@/features/admin/workflows/workflowAdminApi';
import {
	batchProgress,
	describeStep,
	pauseLabel,
	workflowTypeLabel,
} from '@/features/admin/workflows/workflowProgress';
import {
	ClusterWorkflow,
	ClusterWorkflowCommand,
	clusterWorkflowQueryOptions,
	useClusterWorkflowCommand,
} from '@/features/cluster/queries/clusterWorkflow';
import { getClusterInfoQueryOptions } from '@/features/cluster/queries/getClusterInfoQuery';
import { useStaffPermission } from '@/hooks/useAuth';
import { useOrganizationClusterPermissions } from '@/hooks/usePermissions';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Loader2Icon, LoaderCircleIcon, PauseCircleIcon, TriangleAlertIcon } from 'lucide-react';
import { useState } from 'react';

const CLUSTER_POLL_MS = 10_000;

/**
 * Says a durable workflow (an upgrade, say) holds the cluster, which is why central manager refuses changes to it
 * meanwhile. Staff who can read workflows see where it is. Everyone else sees the plain state, or, once the workflow
 * has stopped on a failure, what stopped and the retry or stop central manager lets them send.
 *
 * While shown it polls the cluster, because central manager clearing `workflowId` is what ends it.
 */
export function ClusterWorkflowNotice(
	{ clusterId, workflowId, className }: { clusterId?: string; workflowId?: string | null; className?: string },
) {
	const { data: cluster } = useQuery({
		...getClusterInfoQueryOptions(clusterId, CLUSTER_POLL_MS),
		enabled: !!clusterId && !!workflowId,
	});
	const canReadWorkflows = useStaffPermission('workflow:read');
	const { data: row } = useQuery({
		...heldClusterWorkflowQueryOptions(clusterId, workflowId),
		enabled: !!clusterId && !!workflowId && canReadWorkflows,
	});
	const { data: customerRow, dataUpdatedAt } = useQuery({
		...clusterWorkflowQueryOptions(clusterId, workflowId),
		enabled: !!clusterId && !!workflowId && !canReadWorkflows,
	});

	if (!workflowId) {
		return null;
	}
	// A cached row must not outlive the permission that fetched it.
	if (canReadWorkflows && row) {
		const paused = row.status === 'PAUSED';
		const progress = batchProgress(row);
		const facts = [
			paused ? pauseLabel(row.pause?.reason) : row.status.toLowerCase(),
			describeStep(row),
			progress && !progress.current && (progress.finished === progress.total
				? `all ${progress.total} batches finished`
				: `${progress.finished} of ${progress.total} batches finished`),
		].filter(Boolean);
		return (
			<div className={className}>
				<Alert
					variant={paused && row.pause?.reason !== 'command' ? 'destructive' : 'warning'}
					role="status"
					aria-live="polite"
				>
					{paused ? <PauseCircleIcon /> : <LoaderCircleIcon className="animate-spin" />}
					<AlertTitle>{workflowTypeLabel(row.type)} in progress</AlertTitle>
					<AlertDescription>
						<p>{facts.join(' · ')}</p>
						<Link
							to="/admin/workflows/$workflowId"
							params={{ workflowId }}
							className="underline underline-offset-2 hover:text-foreground"
						>
							Open {workflowId} in Admin
						</Link>
					</AlertDescription>
				</Alert>
			</div>
		);
	}
	if (!canReadWorkflows && clusterId && customerRow?.status === 'PAUSED') {
		return (
			<div className={className}>
				<StoppedWorkflowNotice
					clusterId={clusterId}
					workflow={customerRow}
					readAt={dataUpdatedAt}
					instanceName={(id) => cluster?.instances?.find((instance) => instance?.id === id)?.name ?? id}
				/>
			</div>
		);
	}
	return (
		<div className={className}>
			<Alert variant="warning" role="status" aria-live="polite">
				<LoaderCircleIcon className="animate-spin" />
				<AlertTitle>Update in progress</AlertTitle>
				<AlertDescription>
					A change to this cluster is in progress. Other changes to it wait until it finishes.
				</AlertDescription>
			</Alert>
		</div>
	);
}

function stoppedReason(workflow: ClusterWorkflow, instanceName: (id: string) => string): string {
	if (workflow.message) { return workflow.message; }
	const failed = workflow.failedInstanceIds;
	switch (workflow.pause?.reason) {
		case 'failed':
			if (failed.length === 1) {
				return `Instance ${instanceName(failed[0])} didn’t finish updating, so the update stopped there.`;
			}
			if (failed.length > 1) {
				return `${failed.length} instances didn’t finish updating, so the update stopped there.`;
			}
			return 'Part of the update failed, so it stopped there.';
		case 'unknown':
			return 'We couldn’t confirm whether a step finished, so the update stopped there.';
		case 'command':
			return 'Our team paused it.';
		default:
			return 'It needs our team to continue.';
	}
}

/**
 * A workflow paused on the cluster, as its own users see it. Retry and stop appear only when central manager lists
 * them and the user may change the cluster. After a command they stay held until the page has the workflow as read
 * after central manager acknowledged it, so a poll already in flight can't offer them again.
 */
function StoppedWorkflowNotice(
	{ clusterId, workflow, readAt, instanceName }: {
		clusterId: string;
		workflow: ClusterWorkflow;
		readAt: number;
		instanceName: (id: string) => string;
	},
) {
	const { update: canUpdate } = useOrganizationClusterPermissions(undefined, clusterId);
	const mutation = useClusterWorkflowCommand();
	const [ackedAt, setAckedAt] = useState<number | null>(null);
	const [stopping, setStopping] = useState(false);
	const pending = mutation.isPending || !!workflow.command?.action || (ackedAt !== null && readAt <= ackedAt);
	const failed = workflow.pause?.reason === 'failed' || workflow.pause?.reason === 'unknown';
	const label = workflowTypeLabel(workflow.type);
	const offered = workflow.acceptedCommands;

	const send = (command: ClusterWorkflowCommand) =>
		mutation.mutate({ clusterId, command }, {
			onSuccess: () => {
				setAckedAt(Date.now());
				setStopping(false);
			},
		});

	return (
		<Alert variant={failed ? 'destructive' : 'warning'} role="status" aria-live="polite">
			{failed ? <TriangleAlertIcon /> : <PauseCircleIcon />}
			<AlertTitle>{label} {failed ? 'stopped' : 'paused'}</AlertTitle>
			<AlertDescription>
				<p>{stoppedReason(workflow, instanceName)}</p>
				{pending
					? <p>Your request was sent. This updates once it’s picked up.</p>
					: offered.length > 0 && (
						<p>
							{canUpdate
								? `Other changes to this cluster wait until the update is ${
									offered.includes('abandon') ? 'retried or stopped' : 'retried'
								}.`
								: 'Someone with permission to change this cluster can retry it.'}
						</p>
					)}
				{canUpdate && offered.length > 0 && (
					<div className="mt-2 flex flex-wrap gap-2">
						{offered.includes('retry') && (
							<Button
								type="button"
								size="sm"
								variant="defaultOutline"
								disabled={pending}
								onClick={() => send('retry')}
							>
								{mutation.isPending && mutation.variables?.command === 'retry' && (
									<Loader2Icon className="animate-spin" />
								)}
								Retry update
							</Button>
						)}
						{offered.includes('abandon') && (
							<Button
								type="button"
								size="sm"
								variant="destructiveOutline"
								disabled={pending}
								onClick={() => setStopping(true)}
							>
								Stop update
							</Button>
						)}
					</div>
				)}
			</AlertDescription>
			{stopping && (
				<Dialog open onOpenChange={(open) => !open && !mutation.isPending && setStopping(false)}>
					<DialogContent className="sm:max-w-lg">
						<DialogHeader>
							<DialogTitle>Stop the update?</DialogTitle>
							<DialogDescription>
								Instances already updated keep the change, and the rest stay as they are now. The cluster accepts
								changes again, so you can start the update again later.
							</DialogDescription>
						</DialogHeader>
						<DialogFooter>
							<Button
								type="button"
								variant="outline"
								disabled={mutation.isPending}
								onClick={() => setStopping(false)}
							>
								Cancel
							</Button>
							<Button type="button" variant="destructive" disabled={mutation.isPending} onClick={() => send('abandon')}>
								{mutation.isPending && <Loader2Icon className="animate-spin" />}
								Stop update
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			)}
		</Alert>
	);
}
