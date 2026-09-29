import { describe, expect, it } from 'vitest';
import { allowedRegionIdsFor, shapeCoversRequest, trialScope } from './grantScope';

describe('shapeCoversRequest', () => {
	const shape = [{ planId: 'plan-a', regionId: 'us-1' }, { planId: 'plan-a', regionId: 'eu-1' }];

	it('covers the same pairs in any order, and nothing else', () => {
		expect(shapeCoversRequest(shape, 'plan-a', ['eu-1', 'us-1'])).toBe(true);
		expect(shapeCoversRequest(shape, 'plan-a', ['us-1'])).toBe(false);
		expect(shapeCoversRequest(shape, 'plan-a', ['us-1', 'eu-1', 'ap-1'])).toBe(false);
		expect(shapeCoversRequest(shape, 'plan-b', ['us-1', 'eu-1'])).toBe(false);
	});

	it('covers a self-hosted plan with no region, instance for instance', () => {
		expect(shapeCoversRequest([{ planId: 'self', regionId: null }], 'self', [null])).toBe(true);
		// Adding instances is more than the comp names; central-manager counts pairs, not kinds.
		expect(shapeCoversRequest([{ planId: 'self', regionId: null }], 'self', [null, null])).toBe(false);
		expect(
			shapeCoversRequest([{ planId: 'self', regionId: null }, { planId: 'self', regionId: null }], 'self', [
				null,
				null,
			]),
		)
			.toBe(true);
	});

	it('covers nothing without a shape, a plan, or a resolved region', () => {
		expect(shapeCoversRequest(null, 'plan-a', ['us-1'])).toBe(false);
		expect(shapeCoversRequest([], 'plan-a', ['us-1'])).toBe(false);
		expect(shapeCoversRequest(shape, undefined, ['us-1', 'eu-1'])).toBe(false);
		expect(shapeCoversRequest(shape, 'plan-a', ['us-1', undefined])).toBe(false);
	});
});

describe('trialScope', () => {
	it('reads a trial’s allow-lists, with null for a missing one', () => {
		expect(trialScope({ source: 'trial', allowedPlanIds: ['p'], allowedRegionIds: null })).toEqual({
			planIds: ['p'],
			regionIds: null,
		});
		expect(trialScope({ source: 'trial', allowedPlanIds: [], allowedRegionIds: ['r'] })).toEqual({
			planIds: null,
			regionIds: ['r'],
		});
	});

	it('is null for an unscoped trial and for every other source', () => {
		expect(trialScope({ source: 'trial', allowedPlanIds: null, allowedRegionIds: null })).toBeNull();
		expect(trialScope({ source: 'comped', allowedPlanIds: ['p'], allowedRegionIds: ['r'] })).toBeNull();
		expect(trialScope(null)).toBeNull();
	});
});

describe('allowedRegionIdsFor', () => {
	it('uses whichever list exists, and the overlap when both do', () => {
		expect(allowedRegionIdsFor({ allowedRegionIds: ['a', 'b'] }, null)).toEqual(['a', 'b']);
		expect(allowedRegionIdsFor(undefined, { planIds: null, regionIds: ['b'] })).toEqual(['b']);
		expect(allowedRegionIdsFor({ allowedRegionIds: ['a', 'b'] }, { planIds: null, regionIds: ['b', 'c'] })).toEqual([
			'b',
		]);
		expect(allowedRegionIdsFor({ allowedRegionIds: [] }, null)).toBeUndefined();
	});

	it('falls back to the grant’s list when the two share nothing', () => {
		expect(allowedRegionIdsFor({ allowedRegionIds: ['a'] }, { planIds: null, regionIds: ['c'] })).toEqual(['c']);
	});
});
