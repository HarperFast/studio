import type { SchemaRegion } from '@/integrations/api/api.gen';
import { describe, expect, it } from 'vitest';
import { describeRegionSwap, RegionCohort, regionCohortsOfPlans } from './describeRegionSwap';
import { buildRegionLookup } from './regionLookup';

// A catalog region's cohort is its name.
const catalog = (names: string[]): RegionCohort[] => names.map(name => ({ key: name, name }));
const swap = (currentRegionNames: string[], selectedRegionNames: string[], singleRegionTier = false) =>
	describeRegionSwap({
		currentRegions: catalog(currentRegionNames),
		selectedRegions: catalog(selectedRegionNames),
		singleRegionTier,
	});

describe('regionCohortsOfPlans', () => {
	const lookup = buildRegionLookup(
		[
			{ id: 'us-1', region: 'US', latencyDescription: '83ms', instanceCount: 2 },
			{ id: 'eu-1', region: 'Europe', latencyDescription: '58ms', instanceCount: 2 },
		] as SchemaRegion[],
		[{ id: 'oreg-1', organizationId: 'org-a', name: 'Edge', placement: { gcp: ['us-east1', 'us-west1'] } }],
		undefined,
	);

	it('keys a catalog plan by its region name and a custom region by its id', () => {
		expect(regionCohortsOfPlans([
			{ planId: 'shared', regionId: 'eu-1' },
			{ planId: 'shared', regionId: 'oreg-1', quantity: 2 },
		], lookup)).toEqual([{ key: 'Europe', name: 'Europe' }, { key: 'oreg-1', name: 'Edge' }]);
	});

	it('falls back to what a plan the lookup lacks carries', () => {
		expect(regionCohortsOfPlans([
			{ planId: 'shared', regionId: 'retired-1', region: 'Asia' },
			{ planId: 'shared', regionId: 'oreg-gone', region: 'Old edge' },
		], lookup)).toEqual([{ key: 'Asia', name: 'Asia' }, { key: 'oreg-gone', name: 'Old edge' }]);
	});

	it('skips plans with no region, such as self-hosted instances', () => {
		expect(regionCohortsOfPlans([{ planId: 'self-hosted-0' }], lookup)).toEqual([]);
	});
});

describe('describeRegionSwap', () => {
	it('stays quiet for a new cluster, which has no current regions', () => {
		expect(swap([], ['Europe'])).toBeNull();
	});

	it('stays quiet while any current region is kept', () => {
		expect(swap(['US'], ['US'])).toBeNull();
		expect(swap(['US'], ['Europe', 'US'])).toBeNull();
		expect(swap(['US', 'Asia'], ['Asia', 'Europe'])).toBeNull();
	});

	it('stays quiet until a region is actually chosen', () => {
		expect(swap(['US'], [])).toBeNull();
		expect(swap(['US'], [''])).toBeNull();
	});

	it('names the region to keep and the one to add', () => {
		expect(swap(['US'], ['', 'Europe'])).toBe(
			"A cluster can't move out of all its current regions in one update. Keep US, add Europe as an additional region and save, then remove US once that update has finished.",
		);
	});

	it('asks to keep at least one of several current regions', () => {
		expect(swap(['US', 'Asia', 'US'], ['Europe', 'Canada'])).toBe(
			"A cluster can't move out of all its current regions in one update. Keep at least one of US and Asia, add Europe as an additional region and save, then remove the old regions that are left once that update has finished.",
		);
	});

	it('does not suggest a second region on a tier that allows only one', () => {
		expect(swap(['US'], ['Europe'], true)).toBe(
			"A cluster can't move out of all its current regions in one update, and this tier allows only one region, so it can't move from US to Europe. Create a new cluster in Europe instead.",
		);
	});

	it('matches a custom region by id, as central manager does, not by its name', () => {
		const edge = { key: 'oreg-1', name: 'US' };
		expect(describeRegionSwap({
			currentRegions: [edge],
			selectedRegions: [{ ...edge, name: 'US, renamed' }, ...catalog(['Europe'])],
			singleRegionTier: false,
		})).toBeNull();
		expect(describeRegionSwap({ currentRegions: [edge], selectedRegions: catalog(['US']), singleRegionTier: false }))
			.not.toBeNull();
	});
});
