import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ClusterWorkflow, latestClusterWorkflowQueryOptions } from '@/features/cluster/queries/clusterWorkflow';
import { Cluster } from '@/integrations/api/api.patch';
import { clusterIsSelfManaged } from '@/integrations/api/clusterIsSelfManaged';
import { useQuery } from '@tanstack/react-query';
import { CloudOffIcon, PauseCircleIcon, TriangleAlertIcon } from 'lucide-react';

const DELETE_WORKFLOW = 'DELETE_CLUSTER';

/**
 * A delete that stopped: central manager leaves the cluster `TERMINATING` and pauses the delete when a member did not
 * confirm its teardown, and `GET /Cluster/:id/workflow` names the members. Read only while the cluster is `TERMINATING`.
 */
export function ClusterDeleteNotice({ cluster, className }: { cluster: Cluster; className?: string }) {
	const terminating = cluster.status === 'TERMINATING';
	const { data: workflow, isError } = useQuery({
		...latestClusterWorkflowQueryOptions(cluster.id, cluster.workflowId),
		enabled: terminating && !!cluster.id,
	});
	if (!terminating) {
		return null;
	}
	const noun = clusterIsSelfManaged(cluster) ? 'Removal' : 'Termination';
	const paused = workflow?.type === DELETE_WORKFLOW && workflow.status === 'PAUSED' ? workflow : null;
	if (!isError && !paused) {
		return null;
	}
	const byOperator = paused?.pause?.reason === 'command';
	return (
		<div className={className}>
			{isError && (
				<Alert variant="warning" role="status" aria-live="polite" className={paused ? 'mb-4' : undefined}>
					<CloudOffIcon />
					<AlertTitle>Couldn’t check on the {noun.toLowerCase()}</AlertTitle>
					<AlertDescription>
						<p>
							Studio couldn’t read how it is going.{paused ? ' What follows is from its last successful read.' : ''}
						</p>
					</AlertDescription>
				</Alert>
			)}
			{paused && (
				<Alert variant={byOperator ? 'warning' : 'destructive'} role="status" aria-live="polite">
					{byOperator ? <PauseCircleIcon /> : <TriangleAlertIcon />}
					<AlertTitle>{noun} {byOperator ? 'paused' : 'stopped'}</AlertTitle>
					<AlertDescription>
						<p>{byOperator ? 'Our team paused it.' : describeDeleteFailure(paused, cluster)}</p>
						<p>Our team will finish it. The cluster stays listed until then.</p>
					</AlertDescription>
				</Alert>
			)}
		</div>
	);
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Central manager's sentence names members by id; the cluster record, which it keeps, has their names. Every id the
 * record knows is swapped in one pass, so a swapped-in name is never scanned again, and an id inside a longer one, or
 * one the message mentions without failing, is never mistaken. Without a sentence, the failed members' names alone.
 */
export function describeDeleteFailure(workflow: ClusterWorkflow, cluster: Pick<Cluster, 'instances'>): string {
	const names = new Map<string, string>();
	for (const instance of cluster.instances ?? []) {
		if (instance?.id && instance.name) {
			names.set(instance.id, instance.name);
		}
	}
	if (workflow.message) {
		const ids = [...names.keys()].sort((a, b) => b.length - a.length);
		if (!ids.length) {
			return workflow.message;
		}
		const mention = new RegExp(`(?<![\\w-])(?:${ids.map(escapeRegExp).join('|')})(?![\\w-])`, 'g');
		return workflow.message.replace(mention, (id) => names.get(id) ?? id);
	}
	const failed = workflow.failedInstanceIds.map((id) => names.get(id) || id);
	if (failed.length === 1) {
		return `Instance ${failed[0]} didn’t confirm it was terminated.`;
	}
	if (failed.length > 1) {
		return `Instances ${failed.slice(0, -1).join(', ')} and ${
			failed[failed.length - 1]
		} didn’t confirm they were terminated.`;
	}
	return 'A step of the teardown didn’t finish.';
}
