import { isRunning } from '@/components/ui/utils/badgeStatus';
import { deletedClusterStatuses } from '@/config/clusterStatuses';
import { Cluster } from '@/integrations/api/api.patch';

/**
 * True once every (non-deleted) instance on the cluster reports a running status. On an initial
 * deploy the cluster itself can go RUNNING while some instances are still PROVISIONING or CLONING —
 * the initial admin user/password must not be created until every instance is up, or the
 * still-cloning instances can finish with the credentials the setup flow just replaced.
 *
 * An instance with no status (still unknown) counts as not running, and a cluster with no
 * instance data loaded is never considered ready.
 */
export function allClusterInstancesRunning(cluster: Cluster | undefined): boolean {
	const instances = (cluster?.instances ?? []).filter(
		(instance) => !(instance.status && deletedClusterStatuses.includes(instance.status)),
	);
	return instances.length > 0 && instances.every((instance) => isRunning(instance.status));
}

const restingInstanceStatuses = ['STOPPED', 'ERROR', 'FAILED'];

/**
 * True once no (non-deleted) instance is still mid-change — cloning, provisioning, updating. During a scale-up the
 * cluster reports RUNNING while its new members are still cloning, so the cluster status alone can't say the update
 * is done. Looser than allClusterInstancesRunning: an instance at rest outside RUNNING (stopped, errored) doesn't hold
 * this open, or scaling a cluster with a stopped member would never finish. A missing or unknown status counts as
 * still in progress.
 */
export function allClusterInstancesSettled(cluster: Cluster | undefined): boolean {
	return (cluster?.instances ?? []).every((instance) =>
		(instance.status && deletedClusterStatuses.includes(instance.status))
		|| isRunning(instance.status)
		|| (instance.status && restingInstanceStatuses.includes(instance.status))
	);
}
