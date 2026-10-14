import { Cluster } from '@/integrations/api/api.patch';
import { clusterIsSelfManaged } from '@/integrations/api/clusterIsSelfManaged';

/**
 * None for a self-hosted cluster removed from Fabric: its servers may still run, so its sign-ins stay remembered and an
 * app sign-out still ends their sessions.
 */
export function terminatedClusterSignIns(cluster: Cluster): string[] {
	if (clusterIsSelfManaged(cluster)) {
		return [];
	}
	return [cluster.id, ...(cluster.instances ?? []).map((instance) => instance.id)].filter(Boolean);
}
