import { describe, expect, it } from 'vitest';
import { describeRegionSwap, RegionCohort } from './describeRegionSwap';

// A catalog region's cohort is its name.
const catalog = (names: string[]): RegionCohort[] => names.map(name => ({ key: name, name }));
const swap = (currentRegionNames: string[], selectedRegionNames: string[], singleRegionTier = false) =>
	describeRegionSwap({
		currentRegions: catalog(currentRegionNames),
		selectedRegions: catalog(selectedRegionNames),
		singleRegionTier,
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

	it('asks to keep one of several current regions', () => {
		expect(swap(['US', 'Asia', 'US'], ['Europe', 'Canada'])).toBe(
			"A cluster can't move out of all its current regions in one update. Keep one of US and Asia, add Europe as an additional region and save, then remove the others once that update has finished.",
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
