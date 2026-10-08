import { RegionPlan } from '@/integrations/api/api.patch';
import { RegionPlanEntry } from '../upsertClusterSchema';
import { isOrganizationRegionId, RegionLookup } from './regionLookup';

/**
 * An existing cluster's plans as form entries. Every stored id must resolve: silently dropping one
 * would make the next save delete that region, so an unresolved id is reported for the caller to
 * block on rather than skipped.
 */
export function buildRegionPlanDefaults(
	plans: readonly RegionPlan[] | undefined,
	lookup: RegionLookup,
): { regionPlans: RegionPlanEntry[]; unresolvedRegionIds: string[] } {
	const regionPlans: RegionPlanEntry[] = [];
	const unresolvedRegionIds: string[] = [];
	for (const plan of plans ?? []) {
		if (!plan.regionId) {
			continue;
		}
		if (!lookup.has(plan.regionId)) {
			unresolvedRegionIds.push(plan.regionId);
			continue;
		}
		regionPlans.push(
			isOrganizationRegionId(plan.regionId)
				? { regionId: plan.regionId, quantity: plan.quantity ?? 1 }
				: { regionId: plan.regionId },
		);
	}
	return { regionPlans, unresolvedRegionIds };
}

interface LegacyDraftEntry {
	regionName?: string;
	latencyDescription?: string;
}

/**
 * A saved draft may predate id-keyed entries: its name + latency pairs resolve through the catalog
 * where they still match a row. An id-keyed entry is kept as-is even when the lookup lacks it, so
 * validation reports it on the row instead of the draft silently losing a selection.
 */
export function migrateDraftRegionPlans(
	entries: readonly (Partial<RegionPlanEntry> & LegacyDraftEntry)[] | undefined,
	lookup: RegionLookup,
): RegionPlanEntry[] {
	const migrated: RegionPlanEntry[] = [];
	for (const entry of entries ?? []) {
		if (entry.regionId) {
			migrated.push({ regionId: entry.regionId, ...(entry.quantity ? { quantity: entry.quantity } : {}) });
			continue;
		}
		if (entry.regionName && entry.latencyDescription) {
			for (const region of lookup.values()) {
				if (
					region.kind === 'catalog' && region.name === entry.regionName
					&& region.latencyDescription === entry.latencyDescription
				) {
					migrated.push({ regionId: region.id });
					break;
				}
			}
		}
	}
	return migrated;
}
