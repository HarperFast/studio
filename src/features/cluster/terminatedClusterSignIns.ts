import { Cluster } from '@/integrations/api/api.patch';
import { clusterIsSelfManaged } from '@/integrations/api/clusterIsSelfManaged';

/**
 * The sign-ins a terminated cluster leaves behind: its own and each instance's. None for a self-hosted cluster removed
 * from Fabric, whose servers may still run: those stay remembered, so an app sign-out still ends their sessions.
 */
export function terminatedClusterSignIns(cluster: Cluster): string[] {
	if (clusterIsSelfManaged(cluster)) {
		return [];
	}
	return [cluster.id, ...(cluster.instances ?? []).map((instance) => instance.id)].filter(Boolean);
}
