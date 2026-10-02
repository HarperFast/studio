import { OrganizationRegion } from '@/integrations/api/api.patch';
import { SchemaRegion } from '@/integrations/api/api.gen';
import { describe, expect, it } from 'vitest';
import { buildRegionLookup } from './regionLookup';
import { buildRegionPlanDefaults, migrateDraftRegionPlans } from './regionPlanDefaults';

const catalog: SchemaRegion[] = [
	{ id: 'us-1', region: 'US', latencyDescription: 'Low (1 region)', instanceCount: 2, purchasedBlockMultiplier: 1 },
	{ id: 'eu-1', region: 'EU', latencyDescription: 'Low (1 region)', instanceCount: 2, purchasedBlockMultiplier: 1 },
];
const orgRegion: OrganizationRegion = {
	id: 'oreg-1',
	organizationId: 'org-1',
	name: 'EU edge',
	placement: { gcp: ['europe-west1'] },
	fallbackGroup: null,
	blocksPerUnit: 1,
	active: true,
};
const lookup = buildRegionLookup(catalog, [orgRegion], undefined);

describe('buildRegionPlanDefaults', () => {
	it('maps catalog plans to bare ids and custom plans with their quantity', () => {
		const result = buildRegionPlanDefaults(
			[{ regionId: 'us-1', planId: 'p' }, { regionId: 'oreg-1', planId: 'p', quantity: 3 }],
			lookup,
		);
		expect(result).toEqual({
			regionPlans: [{ regionId: 'us-1' }, { regionId: 'oreg-1', quantity: 3 }],
			unresolvedRegionIds: [],
		});
	});

	it('defaults a custom plan without a stored quantity to one unit', () => {
		expect(buildRegionPlanDefaults([{ regionId: 'oreg-1', planId: 'p' }], lookup).regionPlans).toEqual([
			{ regionId: 'oreg-1', quantity: 1 },
		]);
	});

	it('reports ids it cannot resolve instead of dropping them', () => {
		const result = buildRegionPlanDefaults([{ regionId: 'us-1', planId: 'p' }, { regionId: 'oreg-gone', planId: 'p' }], lookup);
		expect(result.regionPlans).toEqual([{ regionId: 'us-1' }]);
		expect(result.unresolvedRegionIds).toEqual(['oreg-gone']);
	});

	it('skips self-hosted plans that carry no region', () => {
		expect(buildRegionPlanDefaults([{ planId: 'p', instanceFqdn: 'a.example.com' }], lookup)).toEqual({
			regionPlans: [],
			unresolvedRegionIds: [],
		});
	});
});

describe('migrateDraftRegionPlans', () => {
	it('keeps id-keyed entries that still resolve', () => {
		expect(migrateDraftRegionPlans([{ regionId: 'us-1' }, { regionId: 'oreg-1', quantity: 2 }, { regionId: 'gone' }], lookup))
			.toEqual([{ regionId: 'us-1' }, { regionId: 'oreg-1', quantity: 2 }]);
	});

	it('resolves a legacy name + latency draft through the catalog', () => {
		expect(migrateDraftRegionPlans([{ regionName: 'EU', latencyDescription: 'Low (1 region)' }], lookup)).toEqual([
			{ regionId: 'eu-1' },
		]);
	});

	it('drops a legacy entry the catalog no longer matches', () => {
		expect(migrateDraftRegionPlans([{ regionName: 'EU', latencyDescription: 'Lowest' }, {}], lookup)).toEqual([]);
	});

	it('tolerates an absent list', () => {
		expect(migrateDraftRegionPlans(undefined, lookup)).toEqual([]);
	});
});
