import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ClusterWorkflow, latestClusterWorkflowQueryOptions } from '@/features/cluster/queries/clusterWorkflow';
import { Cluster } from '@/integrations/api/api.patch';
import { clusterIsSelfManaged } from '@/integrations/api/clusterIsSelfManaged';
import { useQuery } from '@tanstack/react-query';
import { CloudOffIcon, PauseCircleIcon, TriangleAlertIcon } from 'lucide-react';

const DELETE_WORKFLOW = 'DELETE_CLUSTER';

/**
 * A delete that stopped. Central manager leaves the cluster `TERMINATING` and pauses the delete when a member did not
 * confirm its teardown (central-manager#1134), and its workflow read names the members. Read only while the cluster is
 * `TERMINATING`; a central manager without the read answers 404 once, and nothing shows.
 */
export function ClusterDeleteNotice({ cluster, className }: { cluster: Cluster; className?: string }) {
	const terminating = cluster.status === 'TERMINATING';
	const { data: workflow, isError } = useQuery({
		...latestClusterWorkflowQueryOptions(cluster.id, cluster.workflowId),
		enabled: terminating,
	});
	if (!terminating) {
		return null;
	}
	const noun = clusterIsSelfManaged(cluster) ? 'Removal' : 'Termination';
	// A read that failed leaves the page saying the cluster is being torn down, which it may not be; say so until a read
	// answers. A 404 or 400 is an answer (no workflow to show), never an error.
	if (isError && !workflow) {
		return (
			<div className={className}>
				<Alert variant="warning" role="status" aria-live="polite">
					<CloudOffIcon />
					<AlertTitle>Couldn’t check on the {noun.toLowerCase()}</AlertTitle>
					<AlertDescription>
						<p>Studio couldn’t read how it is going. It keeps trying.</p>
					</AlertDescription>
				</Alert>
			</div>
		);
	}
	if (!workflow || workflow.type !== DELETE_WORKFLOW || workflow.status !== 'PAUSED') {
		return null;
	}
	const byOperator = workflow.pause?.reason === 'command';
	return (
		<div className={className}>
			<Alert variant={byOperator ? 'warning' : 'destructive'} role="status" aria-live="polite">
				{byOperator ? <PauseCircleIcon /> : <TriangleAlertIcon />}
				<AlertTitle>{noun} {byOperator ? 'paused' : 'stopped'}</AlertTitle>
				<AlertDescription>
					<p>{byOperator ? 'Our team paused it.' : describeDeleteFailure(workflow, cluster)}</p>
					<p>Our team will finish it. The cluster stays listed until then.</p>
				</AlertDescription>
			</Alert>
		</div>
	);
}

/**
 * Central manager's sentence says what went wrong (a timeout, a reported failure, an unhealthy host) and names the
 * members by id; the cluster record, which central manager keeps, has their names. Without a sentence, the names alone.
 */
export function describeDeleteFailure(workflow: ClusterWorkflow, cluster: Pick<Cluster, 'instances'>): string {
	const nameOf = (id: string) => cluster.instances?.find((instance) => instance?.id === id)?.name ?? id;
	// Longest id first, so an id that prefixes another is never replaced inside it.
	const ids = [...workflow.failedInstanceIds].sort((a, b) => b.length - a.length);
	if (workflow.message) {
		return ids.reduce((text, id) => text.split(id).join(nameOf(id)), workflow.message);
	}
	const names = workflow.failedInstanceIds.map(nameOf);
	if (names.length === 1) {
		return `Instance ${names[0]} didn’t confirm it was terminated.`;
	}
	if (names.length > 1) {
		return `Instances ${names.slice(0, -1).join(', ')} and ${
			names[names.length - 1]
		} didn’t confirm they were terminated.`;
	}
	return 'A step of the teardown didn’t finish.';
}
