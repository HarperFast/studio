import { RegionPlan } from '@/integrations/api/api.patch';
import { isOrganizationRegionId, regionCohortKey, RegionLookup } from './regionLookup';

const regionList = new Intl.ListFormat('en', { style: 'long', type: 'conjunction' });

/**
 * A region as central manager matches it across an update: a catalog region by name, whatever its latency tier, and a
 * custom region by id (`regionCohortKey`), since its name is free text.
 */
export interface RegionCohort {
	key: string;
	name: string;
}

/** A cluster's plans as central manager matches them; a plan the lookup lacks still matches by what it carries. */
export function regionCohortsOfPlans(plans: readonly RegionPlan[], lookup: RegionLookup): RegionCohort[] {
	return plans.flatMap(plan => {
		const region = plan.regionId ? lookup.get(plan.regionId) : undefined;
		if (region) {
			return [{ key: regionCohortKey(region), name: region.name }];
		}
		if (plan.regionId && isOrganizationRegionId(plan.regionId)) {
			return [{ key: plan.regionId, name: plan.region ?? plan.regionId }];
		}
		return plan.region ? [{ key: plan.region, name: plan.region }] : [];
	});
}

/**
 * Central manager refuses an update that leaves every region a cluster runs in while adding a new one, so moving a
 * cluster takes two saves.
 */
export function describeRegionSwap({ currentRegions, selectedRegions, singleRegionTier }: {
	currentRegions: readonly RegionCohort[];
	selectedRegions: readonly RegionCohort[];
	singleRegionTier: boolean;
}): string | null {
	if (!currentRegions.length) {
		return null;
	}
	const current = new Map(currentRegions.filter(({ key }) => key).map(({ key, name }) => [key, name]));
	const selected = selectedRegions.filter(({ key }) => key);
	if (!current.size || !selected.length || selected.some(({ key }) => current.has(key))) {
		return null;
	}
	const from = regionList.format([...current.values()]);
	const added = [...new Map(selected.map(({ key, name }) => [key, name])).values()];
	const rule = "A cluster can't move out of all its current regions in one update";
	if (singleRegionTier) {
		const [to] = added;
		return `${rule}, and this tier allows only one region, so it can't move from ${from} to ${to}. Create a new cluster in ${to} instead.`;
	}
	const additional = added.length === 1 ? 'an additional region' : 'additional regions';
	const add = `add ${regionList.format(added)} as ${additional}`;
	return current.size === 1
		? `${rule}. Keep ${from}, ${add} and save, then remove ${from} once that update has finished.`
		: `${rule}. Keep at least one of ${from}, ${add} and save, then remove the old regions that are left once that update has finished.`;
}
