import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { heldClusterWorkflowQueryOptions } from '@/features/admin/workflows/workflowAdminApi';
import { batchProgress, pauseLabel, workflowTypeLabel } from '@/features/admin/workflows/workflowProgress';
import { getClusterInfoQueryOptions } from '@/features/cluster/queries/getClusterInfoQuery';
import { useStaffPermission } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { LoaderCircleIcon, PauseCircleIcon } from 'lucide-react';

const CLUSTER_POLL_MS = 10_000;

/**
 * Says a durable workflow (an upgrade, say) holds the cluster, which is why central manager refuses changes to it
 * meanwhile. Staff who can read workflows see where it is; everyone else sees the plain state, and so does staff
 * whenever the workflow can't be read.
 *
 * While shown it polls the cluster, because central manager clearing `workflowId` is what ends it.
 */
export function ClusterWorkflowNotice(
	{ clusterId, workflowId, className }: { clusterId?: string; workflowId?: string | null; className?: string },
) {
	useQuery({ ...getClusterInfoQueryOptions(clusterId, CLUSTER_POLL_MS), enabled: !!clusterId && !!workflowId });
	const canReadWorkflows = useStaffPermission('workflow:read');
	const { data: row } = useQuery({
		...heldClusterWorkflowQueryOptions(clusterId, workflowId),
		enabled: !!clusterId && !!workflowId && canReadWorkflows,
	});

	if (!workflowId) {
		return null;
	}
	// A cached row must not outlive the permission that fetched it.
	if (!canReadWorkflows || !row) {
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

	const paused = row.status === 'PAUSED';
	const progress = batchProgress(row);
	const facts = [
		paused ? pauseLabel(row.pause?.reason) : row.status.toLowerCase(),
		progress && (progress.current
			? `batch ${progress.current} of ${progress.total}`
			: progress.finished === progress.total
			? `all ${progress.total} batches finished`
			: `${progress.finished} of ${progress.total} batches finished`),
		row.step && `step ${row.step}`,
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
