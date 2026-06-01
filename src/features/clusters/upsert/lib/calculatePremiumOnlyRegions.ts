import { SchemaPlan, SchemaRegion } from '@/integrations/api/api.gen';

export type PremiumOnlyRegions = {
	regionNames: Set<string>;
	regionIds: Set<string>;
};

function planServesRegion(plan: SchemaPlan, regionId: string): boolean {
	return !plan.allowedRegionIds?.length || plan.allowedRegionIds.includes(regionId);
}

/**
 * Determines which regions and latencies are only reachable via premium tiers — i.e. plans above the
 * lowest planLevel for the deployment. A region/latency is "premium-only" when no base-level plan can
 * serve it but at least one higher-level plan can. A region name is premium-only when every selectable
 * latency under it is premium-only.
 */
export function calculatePremiumOnlyRegions(
	deploymentPlans: SchemaPlan[],
	regionNameToLatencyToRegion: Record<string, Record<string, SchemaRegion>>,
): PremiumOnlyRegions {
	const regionNames = new Set<string>();
	const regionIds = new Set<string>();
	if (!deploymentPlans.length) {
		return { regionNames, regionIds };
	}

	const minPlanLevel = Math.min(...deploymentPlans.map(plan => plan.planLevel ?? 0));
	const basePlans = deploymentPlans.filter(plan => (plan.planLevel ?? 0) === minPlanLevel);
	const premiumPlans = deploymentPlans.filter(plan => (plan.planLevel ?? 0) > minPlanLevel);
	if (!premiumPlans.length) {
		return { regionNames, regionIds };
	}

	for (const [regionName, latencyToRegion] of Object.entries(regionNameToLatencyToRegion)) {
		let anySelectableLatency = false;
		let allSelectableLatenciesPremiumOnly = true;
		for (const region of Object.values(latencyToRegion)) {
			const servedByBase = basePlans.some(plan => planServesRegion(plan, region.id));
			const servedByPremium = premiumPlans.some(plan => planServesRegion(plan, region.id));
			if (!servedByBase && !servedByPremium) {
				continue;
			}
			anySelectableLatency = true;
			if (!servedByBase) {
				regionIds.add(region.id);
			} else {
				allSelectableLatenciesPremiumOnly = false;
			}
		}
		if (anySelectableLatency && allSelectableLatenciesPremiumOnly) {
			regionNames.add(regionName);
		}
	}

	return { regionNames, regionIds };
}
