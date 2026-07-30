import { describe, expect, it } from 'vitest';
import { RegionFormSchema } from './RegionFormSchema';

const base = {
	id: 'us-east-1',
	region: 'US East',
	instanceCount: 2,
	purchasedBlockMultiplier: 1,
	latencyDescription: '280ms, medium distribution',
	linodePreferredLocations: [],
	gcpPreferredLocations: [],
	forceLocations: false,
	active: true,
	organizationIds: [],
};

describe('RegionFormSchema', () => {
	it('accepts a valid region with its scope and location arrays', () => {
		const result = RegionFormSchema.parse({
			...base,
			linodePreferredLocations: ['us-east'],
			gcpPreferredLocations: [],
			organizationIds: ['org-1'],
		});
		expect(result.linodePreferredLocations).toEqual(['us-east']);
		expect(result.organizationIds).toEqual(['org-1']);
	});

	it('rejects an id with invalid characters', () => {
		expect(RegionFormSchema.safeParse({ ...base, id: 'US East 1' }).success).toBe(false);
	});

	it('rejects a non-positive or fractional instance count', () => {
		expect(RegionFormSchema.safeParse({ ...base, instanceCount: 0 }).success).toBe(false);
		expect(RegionFormSchema.safeParse({ ...base, instanceCount: 1.5 }).success).toBe(false);
	});

	it('requires the core string fields', () => {
		expect(RegionFormSchema.safeParse({ ...base, region: '' }).success).toBe(false);
		expect(RegionFormSchema.safeParse({ ...base, latencyDescription: '' }).success).toBe(false);
	});

	describe('forceLocations', () => {
		it('rejects Force with no preferred locations, and reports it on that field', () => {
			const result = RegionFormSchema.safeParse({ ...base, forceLocations: true });
			expect(result.success).toBe(false);
			expect(result.error?.issues[0]?.path).toEqual(['forceLocations']);
		});

		it('accepts Force with a location from either provider', () => {
			expect(
				RegionFormSchema.safeParse({ ...base, forceLocations: true, linodePreferredLocations: ['us-east'] }).success,
			).toBe(true);
			expect(
				RegionFormSchema.safeParse({ ...base, forceLocations: true, gcpPreferredLocations: ['us-central1'] }).success,
			).toBe(true);
		});

		it('still allows an empty location list when Force is off', () => {
			expect(RegionFormSchema.safeParse(base).success).toBe(true);
		});
	});
});
