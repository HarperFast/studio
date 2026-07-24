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
