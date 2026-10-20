import { Cluster } from '@/integrations/api/api.patch';
import { clusterIsSelfManaged } from '@/integrations/api/clusterIsSelfManaged';

export function clusterSignInIds(cluster: Cluster): string[] {
	return [cluster.id, ...(cluster.instances ?? []).map((instance) => instance.id)].filter(Boolean);
}

/**
 * None for a self-hosted cluster removed from Fabric: its servers may still run, and forgetting their sign-ins without a
 * logout would leave their sessions open.
 */
export function terminatedClusterSignIns(cluster: Cluster): string[] {
	return clusterIsSelfManaged(cluster) ? [] : clusterSignInIds(cluster);
}
