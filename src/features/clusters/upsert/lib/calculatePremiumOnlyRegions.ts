import { SchemaPlan, SchemaRegion } from '@/integrations/api/api.gen';

export type PremiumOnlyRegions = {
	regionNames: Set<string>;
	regionIds: Set<string>;
};

function planServesRegion(plan: SchemaPlan, regionId: string): boolean {
	return !plan.allowedRegionIds?.length || plan.allowedRegionIds.includes(regionId);
}

/**
 * Determines which regions and latencies cost money to reach. A region/latency is "premium-only"
 * when no free plan can serve it but at least one paid plan can. A region name is premium-only when
 * every selectable latency under it is premium-only.
 *
 * Keyed on price, not planLevel: Hobbyist is planLevel 0 like the trial, so treating the lowest
 * level as the baseline made a $20 plan's reach define what counts as free — and the moment
 * Hobbyist's region list opened up, every badge silently disappeared.
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

	const basePlans = deploymentPlans.filter(plan => !plan.priceUsd);
	const premiumPlans = deploymentPlans.filter(plan => !!plan.priceUsd);
	// Nothing to contrast against: an all-free or all-paid deployment has no premium tier.
	if (!premiumPlans.length || !basePlans.length) {
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
