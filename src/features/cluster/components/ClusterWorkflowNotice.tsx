import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { heldClusterWorkflowQueryOptions } from '@/features/admin/workflows/workflowAdminApi';
import {
	batchProgress,
	describeStep,
	pauseLabel,
	workflowTypeLabel,
} from '@/features/admin/workflows/workflowProgress';
import { ClusterWorkflow, latestClusterWorkflowQueryOptions } from '@/features/cluster/queries/clusterWorkflow';
import { getClusterInfoQueryOptions } from '@/features/cluster/queries/getClusterInfoQuery';
import { getHarperVersionsOptions } from '@/features/clusters/queries/getHarperVersionsQuery';
import { detectPartialUpgrade, PartialUpgrade } from '@/features/clusters/upsert/lib/detectPartialUpgrade';
import { useStaffPermission } from '@/hooks/useAuth';
import { useOrganizationClusterPermissions } from '@/hooks/usePermissions';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation, useParams } from '@tanstack/react-router';
import { LoaderCircleIcon, PauseCircleIcon, TriangleAlertIcon } from 'lucide-react';
import { useMemo } from 'react';

const CLUSTER_POLL_MS = 10_000;
/** Ended upgrades worth offering again: central manager rolled back what hadn't finished. */
const ENDED_UNFINISHED = ['UNDONE', 'ABANDONED'];

/**
 * Why central manager refuses changes to a held cluster, and, once an upgrade has left it on mixed versions, how to
 * run it again. While held it polls the cluster, because central manager clearing `workflowId` is what ends the hold.
 */
export function ClusterWorkflowNotice(
	{ clusterId, workflowId, className }: { clusterId?: string; workflowId?: string | null; className?: string },
) {
	const held = !!workflowId;
	const { data: cluster } = useQuery({
		...getClusterInfoQueryOptions(clusterId, held ? CLUSTER_POLL_MS : false),
		enabled: !!clusterId,
	});
	const { organizationId } = useParams({ strict: false }) as { organizationId?: string };
	const lagging = !held && !!cluster && !!detectPartialUpgrade(cluster.instances ?? []);
	// Versions pinned to the organization decide whether the lagging instances have a known target, as on the Version
	// page. Never read, the target is unknown too; a failed refresh keeps the list the Version page also still uses.
	const versions = useQuery({
		...getHarperVersionsOptions(organizationId ?? ''),
		enabled: lagging && !!organizationId,
	});
	const partial = useMemo(() => {
		if (!lagging || !cluster || versions.isPending) { return null; }
		const found = detectPartialUpgrade(
			cluster.instances ?? [],
			(versions.data?.value ?? []).filter((v) => v.scoped).map((v) => v.version),
		);
		return found && !versions.data ? { ...found, ambiguous: true } : found;
	}, [lagging, cluster, versions.isPending, versions.data]);
	const canReadWorkflows = useStaffPermission('workflow:read');
	const { data: row } = useQuery({
		...heldClusterWorkflowQueryOptions(clusterId, workflowId),
		enabled: !!clusterId && held && canReadWorkflows,
	});
	const { data: latest } = useQuery({
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
				<EndedUpgradeNotice
					clusterId={clusterId}
					organizationId={organizationId}
					workflow={latest}
					partial={partial}
					instanceName={instanceName}
				/>
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
				<PausedWorkflowNotice workflow={latest} instanceName={instanceName} />
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
 * Central manager re-targets the instances an unfinished upgrade left behind when it runs again, so that is the
 * recovery.
 */
function EndedUpgradeNotice({ clusterId, organizationId, workflow, partial, instanceName }: {
	clusterId: string;
	organizationId?: string;
	workflow: ClusterWorkflow;
	partial: PartialUpgrade;
	instanceName: (id: string) => string;
}) {
	const { update: canUpdate } = useOrganizationClusterPermissions(organizationId, clusterId);
	const onVersionPage = useLocation({ select: (location) => location.pathname.endsWith('/edit/version') });
	return (
		<Alert variant="warning" role="status">
			<TriangleAlertIcon />
			<AlertTitle>The last {workflowTypeLabel(workflow.type)} didn’t finish</AlertTitle>
			<AlertDescription>
				<p>
					{failureFacts(workflow, instanceName) ?? 'It stopped before every instance was updated.'} {partial.ambiguous
						? `${partial.behindCount} of ${partial.total} instances run a different version from the rest.`
						: `${partial.behindCount} of ${partial.total} instances ${
							partial.behindCount === 1 ? 'is' : 'are'
						} still behind ${partial.latest}.`}
				</p>
				{!onVersionPage && (canUpdate && organizationId
					? (
						<Link
							to="/$organizationId/$clusterId/edit/version"
							params={{ organizationId, clusterId }}
							className="underline underline-offset-2 hover:text-foreground"
						>
							{partial.ambiguous ? 'Choose a version on the Version page' : 'Run the upgrade again from Version'}
						</Link>
					)
					: <p>Someone with permission to change this cluster can run it again from Version.</p>)}
			</AlertDescription>
		</Alert>
	);
}

function PausedWorkflowNotice({ workflow, instanceName }: {
	workflow: ClusterWorkflow;
	instanceName: (id: string) => string;
}) {
	const failed = workflow.pause?.reason !== 'command';
	return (
		<Alert variant={failed ? 'destructive' : 'warning'} role="status" aria-live="polite">
			{failed ? <TriangleAlertIcon /> : <PauseCircleIcon />}
			<AlertTitle>{workflowTypeLabel(workflow.type)} {failed ? 'stopped' : 'paused'}</AlertTitle>
			<AlertDescription>
				<p>{pausedReason(workflow, instanceName)}</p>
				<p>Other changes to this cluster wait until it continues.</p>
			</AlertDescription>
		</Alert>
	);
}
