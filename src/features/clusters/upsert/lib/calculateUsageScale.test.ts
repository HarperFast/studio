import { SchemaPlan, SchemaRegion } from '@/integrations/api/api.gen';
import { describe, expect, it } from 'vitest';

import { calculateUsageScale, logarithmicFill } from './calculateUsageScale';

const plan = (planLimits: Partial<NonNullable<SchemaPlan['planLimits']>>): SchemaPlan => ({ planLimits } as SchemaPlan);

const region = (purchasedBlockMultiplier?: number): SchemaRegion => ({ purchasedBlockMultiplier } as SchemaRegion);

describe('calculateUsageScale', () => {
	it('takes min/max across plans and scales reads (not writes) by the region multiplier', () => {
		const plans = [
			plan({ readsPerMinuteCount: 100, totalReadCount: 1000, writesPerMinuteCount: 10, totalWriteCount: 50 }),
			plan({ readsPerMinuteCount: 200, totalReadCount: 4000, writesPerMinuteCount: 5, totalWriteCount: 100 }),
		];
		const regions = { us: { low: region(1), high: region(3) } };

		expect(calculateUsageScale(plans, regions)).toEqual({
			// reads use the smallest multiplier (1) for the floor and the largest (3) for the ceiling
			readRate: { min: 100, max: 600 },
			totalReads: { min: 1000, max: 12000 },
			// writes are unaffected by the multiplier
			writeRate: { min: 5, max: 10 },
			totalWrites: { min: 50, max: 100 },
		});
	});

	it('defaults the multiplier to 1 when no regions are available', () => {
		const plans = [plan({ readsPerMinuteCount: 100, totalReadCount: 1000 })];

		const scale = calculateUsageScale(plans, {});

		expect(scale.readRate).toEqual({ min: 100, max: 100 });
		expect(scale.totalReads).toEqual({ min: 1000, max: 1000 });
	});

	it('treats a missing purchasedBlockMultiplier as 1', () => {
		const plans = [plan({ readsPerMinuteCount: 100, totalReadCount: 1000 })];
		const regions = { us: { low: region(undefined), high: region(4) } };

		expect(calculateUsageScale(plans, regions).readRate).toEqual({ min: 100, max: 400 });
	});

	it('ignores undefined, zero, and negative values when computing the range', () => {
		const plans = [
			plan({ readsPerMinuteCount: undefined, totalReadCount: 0 }),
			plan({ readsPerMinuteCount: 0, totalReadCount: 500 }),
			plan({ readsPerMinuteCount: 150, totalReadCount: -10 }),
		];

		const scale = calculateUsageScale(plans, {});

		expect(scale.readRate).toEqual({ min: 150, max: 150 });
		expect(scale.totalReads).toEqual({ min: 500, max: 500 });
	});

	it('returns zeroed ranges when there are no plans', () => {
		expect(calculateUsageScale([], {})).toEqual({
			readRate: { min: 0, max: 0 },
			totalReads: { min: 0, max: 0 },
			writeRate: { min: 0, max: 0 },
			totalWrites: { min: 0, max: 0 },
		});
	});
});

describe('logarithmicFill', () => {
	it('returns 0 for non-positive values', () => {
		expect(logarithmicFill(0, { min: 1, max: 100 })).toBe(0);
		expect(logarithmicFill(-5, { min: 1, max: 100 })).toBe(0);
	});

	it('returns 0 at the floor and 1 at the ceiling', () => {
		expect(logarithmicFill(10, { min: 10, max: 1000 })).toBeCloseTo(0);
		expect(logarithmicFill(1000, { min: 10, max: 1000 })).toBeCloseTo(1);
	});

	it('places a geometric midpoint at 0.5', () => {
		// 10 is the geometric mean of 1 and 100, so it sits halfway on a log scale
		expect(logarithmicFill(10, { min: 1, max: 100 })).toBeCloseTo(0.5);
	});

	it('clamps values above the ceiling to 1 and below the floor to 0', () => {
		expect(logarithmicFill(5000, { min: 10, max: 1000 })).toBe(1);
		expect(logarithmicFill(5, { min: 10, max: 1000 })).toBeCloseTo(0);
	});

	it('returns 1 when the range has no span', () => {
		expect(logarithmicFill(5, { min: 5, max: 5 })).toBe(1);
	});
});
