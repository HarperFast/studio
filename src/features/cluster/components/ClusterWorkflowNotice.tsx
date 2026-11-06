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
	latestClusterWorkflowQueryOptions,
	useClusterWorkflowCommand,
} from '@/features/cluster/queries/clusterWorkflow';
import { getClusterInfoQueryOptions } from '@/features/cluster/queries/getClusterInfoQuery';
import { detectPartialUpgrade, PartialUpgrade } from '@/features/clusters/upsert/lib/detectPartialUpgrade';
import { useStaffPermission } from '@/hooks/useAuth';
import { useOrganizationClusterPermissions } from '@/hooks/usePermissions';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation, useParams } from '@tanstack/react-router';
import { Loader2Icon, LoaderCircleIcon, PauseCircleIcon, TriangleAlertIcon } from 'lucide-react';
import { useMemo, useState } from 'react';

const CLUSTER_POLL_MS = 10_000;
/** Ended upgrades worth offering again: central manager rolled back what hadn't finished. */
const ENDED_UNFINISHED = ['UNDONE', 'ABANDONED'];

/**
 * Says a durable workflow (an upgrade, say) holds the cluster, which is why central manager refuses changes to it
 * meanwhile. Staff who can read workflows see where it is. Everyone else sees the plain state, or, once the workflow
 * has paused, why and the retry or stop central manager lets them send.
 *
 * Once nothing holds the cluster, a cluster left on mixed versions by an upgrade that didn't finish says so and points
 * at the Version page, where it can be run again.
 *
 * While a workflow holds the cluster it polls the cluster, because central manager clearing `workflowId` is what ends it.
 */
export function ClusterWorkflowNotice(
	{ clusterId, workflowId, className }: { clusterId?: string; workflowId?: string | null; className?: string },
) {
	const held = !!workflowId;
	const { data: cluster } = useQuery({
		...getClusterInfoQueryOptions(clusterId, held ? CLUSTER_POLL_MS : false),
		enabled: !!clusterId,
	});
	const partial = useMemo(
		() => (!held && cluster ? detectPartialUpgrade(cluster.instances ?? []) : null),
		[held, cluster],
	);
	const canReadWorkflows = useStaffPermission('workflow:read');
	const { data: row } = useQuery({
		...heldClusterWorkflowQueryOptions(clusterId, workflowId),
		enabled: !!clusterId && held && canReadWorkflows,
	});
	const { data: latest, dataUpdatedAt } = useQuery({
		...latestClusterWorkflowQueryOptions(clusterId, workflowId),
		// Staff read a held workflow from Admin; nobody reads it for a uniform cluster with nothing holding it.
		enabled: !!clusterId && (held ? !canReadWorkflows : !!partial),
	});
	const instanceName = (id: string) => cluster?.instances?.find((instance) => instance?.id === id)?.name ?? id;

	if (!clusterId) {
		return null;
	}
	if (!held) {
		if (!partial || !latest || latest.type !== 'UPDATE_HARPER_VERSION' || !ENDED_UNFINISHED.includes(latest.status)) {
			return null;
		}
		return (
			<div className={className}>
				<EndedUpgradeNotice clusterId={clusterId} workflow={latest} partial={partial} instanceName={instanceName} />
			</div>
		);
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
							params={{ workflowId: workflowId as string }}
							className="underline underline-offset-2 hover:text-foreground"
						>
							Open {workflowId} in Admin
						</Link>
					</AlertDescription>
				</Alert>
			</div>
		);
	}
	if (!canReadWorkflows && latest?.id === workflowId && latest.status === 'PAUSED') {
		return (
			<div className={className}>
				<StoppedWorkflowNotice
					// A dialog or hold opened for one workflow must not carry over to another.
					key={`${clusterId}:${latest.id}`}
					clusterId={clusterId}
					workflow={latest}
					readAt={dataUpdatedAt}
					instanceName={instanceName}
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

/** The failed instances by name, else central manager's own words; null when it gave neither. */
function failureFacts(workflow: ClusterWorkflow, instanceName: (id: string) => string): string | null {
	const failed = workflow.failedInstanceIds;
	if (failed.length === 1) { return `Instance ${instanceName(failed[0])} didn’t finish updating.`; }
	if (failed.length > 1) { return `${failed.length} instances didn’t finish updating.`; }
	return workflow.message || null;
}

function pausedReason(workflow: ClusterWorkflow, instanceName: (id: string) => string): string {
	switch (workflow.pause?.reason) {
		case 'command':
			return 'Our team paused it.';
		case 'unknown':
			return failureFacts(workflow, instanceName)
				?? 'We couldn’t confirm whether a step finished, so the update stopped there.';
		case 'finalize-failed':
			return failureFacts(workflow, instanceName) ?? 'The update’s last step didn’t finish, so it stopped there.';
		case 'failed':
			return failureFacts(workflow, instanceName) ?? 'Part of the update failed, so it stopped there.';
		default:
			return 'It needs our team to continue.';
	}
}

/**
 * An upgrade that ended without reaching every instance, shown while the cluster is still on mixed versions. Central
 * manager re-targets the instances it left behind when the upgrade is run again, which the Version page offers.
 */
function EndedUpgradeNotice({ clusterId, workflow, partial, instanceName }: {
	clusterId: string;
	workflow: ClusterWorkflow;
	partial: PartialUpgrade;
	instanceName: (id: string) => string;
}) {
	const { organizationId } = useParams({ strict: false }) as { organizationId?: string };
	const { update: canUpdate } = useOrganizationClusterPermissions(organizationId, clusterId);
	const onVersionPage = useLocation({ select: (location) => location.pathname.endsWith('/edit/version') });
	return (
		<Alert variant="warning" role="status">
			<TriangleAlertIcon />
			<AlertTitle>The last {workflowTypeLabel(workflow.type)} didn’t finish</AlertTitle>
			<AlertDescription>
				<p>
					{failureFacts(workflow, instanceName) ?? 'It stopped before every instance was updated.'}{' '}
					{partial.behindCount} of {partial.total} instances {partial.behindCount === 1 ? 'is' : 'are'} still behind
					{' '}
					{partial.latest}.
				</p>
				{!onVersionPage && (canUpdate && organizationId
					? (
						<Link
							to="/$organizationId/$clusterId/edit/version"
							params={{ organizationId, clusterId }}
							className="underline underline-offset-2 hover:text-foreground"
						>
							Run the upgrade again from Version
						</Link>
					)
					: <p>Someone with permission to change this cluster can run it again from Version.</p>)}
			</AlertDescription>
		</Alert>
	);
}

/**
 * A workflow paused on the cluster, as its own users see it. Retry and stop appear only when central manager lists
 * them and the user may change the cluster. After a command they stay held until the page has the workflow as read
 * after central manager acknowledged it, so a poll already in flight can't offer them again. The Stop confirmation
 * closes once central manager stops accepting abandon.
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
	const waiting = !!workflow.command?.action || (ackedAt !== null && readAt <= ackedAt);
	const pending = mutation.isPending || waiting;
	const canStop = canUpdate && workflow.acceptedCommands.includes('abandon') && !waiting;
	// The confirmation closes for good once stopping is off the table, rather than reopening if it comes back.
	if (stopping && !canStop && !mutation.isPending) { setStopping(false); }
	const failed = workflow.pause?.reason !== 'command';
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
				<p>{pausedReason(workflow, instanceName)}</p>
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
			{stopping && canStop && (
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
