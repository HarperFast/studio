import { SchemaPlan, SchemaRegion } from '@/integrations/api/api.gen';
import { describe, expect, it } from 'vitest';
import { calculatePremiumOnlyRegions } from './calculatePremiumOnlyRegions';

const region = (id: string, name: string, latency: string): SchemaRegion =>
	({ id, region: name, latencyDescription: latency }) as SchemaRegion;

// One narrow region per family (what the free tier is limited to) plus a wide US distribution.
const REGIONS: Record<string, Record<string, SchemaRegion>> = {
	US: {
		'narrow': region('us-1', 'US', 'narrow'),
		'wide': region('us-3', 'US', 'wide'),
	},
	'US-NE': {
		'narrow': region('us-ne-1', 'US-NE', 'narrow'),
	},
};

const plan = (id: string, priceUsd: number, planLevel: number, allowedRegionIds?: string[]): SchemaPlan =>
	({ id, priceUsd, planLevel, allowedRegionIds }) as SchemaPlan;

const TRIAL = plan('fabric-block-trial', 0, 0, ['us-1']);
const HOBBYIST_CAPPED = plan('fabric-block-hobbyist', 20, 0, ['us-1']);
const HOBBYIST_OPEN = plan('fabric-block-hobbyist', 20, 0);
const LEVEL_1 = plan('fabric-block-level-1', 85, 1);

describe('calculatePremiumOnlyRegions', () => {
	it('badges what only a paid plan can reach', () => {
		const result = calculatePremiumOnlyRegions([TRIAL, LEVEL_1], REGIONS);
		expect(result.regionIds).toEqual(new Set(['us-3', 'us-ne-1']));
		// Every latency under US-NE is paid-only, so the whole family is badged.
		expect(result.regionNames).toEqual(new Set(['US-NE']));
	});

	// The regression this function was rekeyed for: Hobbyist is planLevel 0 like the trial, so the
	// old "lowest planLevel is the baseline" rule let a $20 plan's reach define what counts as free.
	// Opening Hobbyist's region list then erased every badge, including for trial users.
	it('keeps the badges when Hobbyist stops being region-capped', () => {
		const capped = calculatePremiumOnlyRegions([TRIAL, HOBBYIST_CAPPED, LEVEL_1], REGIONS);
		const open = calculatePremiumOnlyRegions([TRIAL, HOBBYIST_OPEN, LEVEL_1], REGIONS);
		expect(open.regionIds).toEqual(capped.regionIds);
		expect(open.regionIds).toEqual(new Set(['us-3', 'us-ne-1']));
	});

	it('badges nothing when every plan is free, or every plan is paid', () => {
		expect(calculatePremiumOnlyRegions([TRIAL], REGIONS).regionIds.size).toBe(0);
		expect(calculatePremiumOnlyRegions([HOBBYIST_OPEN, LEVEL_1], REGIONS).regionIds.size).toBe(0);
	});

	it('badges nothing for an empty plan list', () => {
		const result = calculatePremiumOnlyRegions([], REGIONS);
		expect(result.regionIds.size).toBe(0);
		expect(result.regionNames.size).toBe(0);
	});

	// An unrestricted free plan reaches everything, so nothing costs money to reach.
	it('badges nothing when the free plan has no region cap', () => {
		const openTrial = plan('fabric-block-trial', 0, 0);
		expect(calculatePremiumOnlyRegions([openTrial, LEVEL_1], REGIONS).regionIds.size).toBe(0);
	});
});
