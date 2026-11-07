import { isDeletedCluster } from '@/config/clusterStatuses';
import type { Cluster } from '@/integrations/api/api.patch';

/**
 * Whether another cluster of the organization holds its one free plan, as central manager counts it
 * (`validateFreePlanAcrossOrg`): a cluster being deleted or torn down no longer does, since the plan is freed when the
 * delete is admitted, but a `FAILED` cluster that was not torn down still does, as an update crash leaves its instances
 * serving. The form refuses what the server would.
 */
export function organizationUsesFreePlan(
	clusters: readonly Cluster[] | undefined,
	planTypes: readonly { id: string; priceUsd?: number }[] | undefined,
	exceptClusterId?: string,
): boolean {
	if (!planTypes) {
		return false;
	}
	for (const cluster of clusters ?? []) {
		if (cluster.id === exceptClusterId || isDeletedCluster(cluster)) {
			continue;
		}
		for (const clusterPlan of cluster.plans ?? []) {
			const plan = planTypes.find((candidate) => candidate.id === clusterPlan.planId);
			if (plan?.priceUsd === 0 && !plan.id.startsWith('self-hosted')) {
				return true;
			}
		}
	}
	return false;
}
