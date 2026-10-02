import { OrganizationRegion } from '@/integrations/api/api.patch';
import { SchemaCloudInstanceTypes, SchemaRegion } from '@/integrations/api/api.gen';

const ORGANIZATION_REGION_ID_PREFIX = 'oreg-';

export function isOrganizationRegionId(regionId: string | undefined | null): boolean {
	return typeof regionId === 'string' && regionId.startsWith(ORGANIZATION_REGION_ID_PREFIX);
}

/** Central-manager's MAX_QUANTITY: the most units one region plan may deploy. */
export const MAX_REGION_PLAN_QUANTITY = 50;

/** Central-manager refuses a cluster that deploys a custom region with fewer instances than this. */
export const MIN_CLUSTER_INSTANCES = 2;

/**
 * One shape for a catalog tier and an organization's custom region, keyed by the id central-manager
 * stores on the plan. `instanceCount` and `blocksPerUnit` are per quantity unit; a catalog tier is
 * always one unit.
 */
export type ResolvedRegion =
	& {
		id: string;
		name: string;
		instanceCount: number;
		blocksPerUnit: number;
		active: boolean;
	}
	& (
		| { kind: 'catalog'; latencyDescription: string; source: SchemaRegion }
		| { kind: 'organization'; shape: string[]; fallbackGroup: string | null; source: OrganizationRegion }
	);

export type RegionLookup = ReadonlyMap<string, ResolvedRegion>;

export function organizationRegionShape(
	region: OrganizationRegion,
	provider: keyof SchemaCloudInstanceTypes | undefined,
): string[] {
	return region.placement?.[provider ?? 'gcp'] ?? [];
}

export function buildRegionLookup(
	catalog: readonly SchemaRegion[] | undefined,
	organizationRegions: readonly OrganizationRegion[] | undefined,
	provider: keyof SchemaCloudInstanceTypes | undefined,
): RegionLookup {
	const lookup = new Map<string, ResolvedRegion>();
	for (const region of catalog ?? []) {
		lookup.set(region.id, {
			kind: 'catalog',
			id: region.id,
			name: region.region,
			latencyDescription: region.latencyDescription,
			instanceCount: region.instanceCount,
			blocksPerUnit: region.purchasedBlockMultiplier ?? 1,
			active: (region as { active?: boolean }).active !== false,
			source: region,
		});
	}
	for (const region of organizationRegions ?? []) {
		const shape = organizationRegionShape(region, provider);
		lookup.set(region.id, {
			kind: 'organization',
			id: region.id,
			name: region.name,
			shape,
			fallbackGroup: region.fallbackGroup ?? null,
			instanceCount: shape.length,
			blocksPerUnit: region.blocksPerUnit ?? 1,
			active: region.active !== false,
			source: region,
		});
	}
	return lookup;
}

/** A quantity-expanded view shaped like a catalog row, for the resources panel. */
export function regionAtQuantity(region: ResolvedRegion, quantity: number | undefined): SchemaRegion {
	const units = quantity ?? 1;
	return {
		id: region.id,
		region: region.name,
		latencyDescription: region.kind === 'catalog' ? region.latencyDescription : describeShape(region.shape),
		instanceCount: region.instanceCount * units,
		purchasedBlockMultiplier: region.blocksPerUnit * units,
	};
}

/** "fr-par ×2 · it-mil" — each datacenter once, with its count when repeated. */
export function describeShape(shape: readonly string[]): string {
	const counts = new Map<string, number>();
	for (const datacenter of shape) {
		counts.set(datacenter, (counts.get(datacenter) ?? 0) + 1);
	}
	return [...counts].map(([datacenter, count]) => (count > 1 ? `${datacenter} ×${count}` : datacenter)).join(' · ');
}

/**
 * The key central-manager groups plans under: a catalog family shares a name across its tiers, an
 * organization region is its own cohort. Two entries with the same key are a duplicate region.
 */
export function regionCohortKey(region: ResolvedRegion): string {
	return region.kind === 'organization' ? region.id : region.name;
}
