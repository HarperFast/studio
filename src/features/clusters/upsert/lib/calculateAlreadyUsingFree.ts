import { isFailed, isTerminated } from '@/components/ui/utils/badgeStatus';
import { SchemaPlan } from '@/integrations/api/api.gen';
import { ENTERPRISE } from '@/integrations/api/orgType';

interface FreeUsageCluster {
	id?: string;
	status?: string;
	plans?: { planId?: string }[];
}

interface FreeUsageOrganization {
	type?: string;
	clusters?: FreeUsageCluster[];
}

/**
 * Whether the org has already spent its one free cluster, so the form must steer away from the
 * free plan (both as a default and as a submittable choice).
 *
 * The one-free-cluster rule is a self-service limit: enterprise orgs are contracted and invoiced
 * off-platform (their billing/invoice pages say as much), so the UI does not cap how many free
 * clusters they stand up. Self-hosted plans are also free-of-charge and never count.
 */
export function calculateAlreadyUsingFree(
	organization: FreeUsageOrganization | undefined,
	currentClusterId: string | undefined,
	planTypes: SchemaPlan[] | undefined,
): boolean {
	if (organization?.type === ENTERPRISE) {
		return false;
	}
	for (const orgCluster of organization?.clusters ?? []) {
		if (
			orgCluster.id !== currentClusterId
			&& planTypes
			&& !isTerminated(orgCluster.status)
			&& !isFailed(orgCluster.status)
			&& orgCluster.plans
		) {
			for (const clusterPlan of orgCluster.plans) {
				const foundPlan = planTypes.find(p => p.id === clusterPlan.planId);
				if (foundPlan?.priceUsd === 0 && !foundPlan.id.startsWith('self-hosted')) {
					return true;
				}
			}
		}
	}
	return false;
}
