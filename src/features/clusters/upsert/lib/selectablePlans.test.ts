import { SchemaPlan } from '@/integrations/api/api.gen';
import { describe, expect, it } from 'vitest';
import { selectablePlansByTier } from './selectablePlans';

const plan = (id: string, priceUsd: number, deploymentType = 'colocated'): SchemaPlan =>
	({ id, priceUsd, deploymentType }) as SchemaPlan;

const COLOCATED: Record<string, SchemaPlan> = {
	'30-day trial (1K read/min)': plan('fabric-block-trial', 0),
	'Hobbyist (1K read/min)': plan('fabric-block-hobbyist', 20),
	'Medium (10K read/min)': plan('fabric-block-level-1', 85),
};

const tiers = (result: Record<string, SchemaPlan>) => Object.keys(result).sort();

describe('selectablePlansByTier', () => {
	// Creating a cluster is the one case where a free plan IS the offer.
	it('offers everything when creating a cluster', () => {
		const result = selectablePlansByTier(COLOCATED, { isExistingCluster: false });
		expect(tiers(result)).toEqual(tiers(COLOCATED));
	});

	it('drops the trial when editing a cluster that is not on it', () => {
		const result = selectablePlansByTier(COLOCATED, {
			isExistingCluster: true,
			currentPlanId: 'fabric-block-level-1',
		});
		expect(tiers(result)).toEqual(['Hobbyist (1K read/min)', 'Medium (10K read/min)']);
	});

	// Otherwise a customer still on the trial opens the editor to a picker with nothing selected.
	it('keeps the trial listed while it is the tier being shown', () => {
		const result = selectablePlansByTier(COLOCATED, {
			isExistingCluster: true,
			currentPlanId: 'fabric-block-trial',
			selectedPerformance: '30-day trial (1K read/min)',
		});
		expect(tiers(result)).toEqual(tiers(COLOCATED));
	});

	// Arriving from the upgrade CTA preselects the paid target, so the trial is no longer displayed —
	// and listing it then just offers a move back onto a plan that cannot be re-entered.
	it('drops the trial once the selection has moved off it', () => {
		const result = selectablePlansByTier(COLOCATED, {
			isExistingCluster: true,
			currentPlanId: 'fabric-block-trial',
			selectedPerformance: 'Hobbyist (1K read/min)',
		});
		expect(tiers(result)).toEqual(['Hobbyist (1K read/min)', 'Medium (10K read/min)']);
	});

	// The self-hosted free tier is a real ongoing plan, not a trial you cannot re-enter.
	it('keeps a free self-hosted plan selectable when editing', () => {
		const selfHosted = { 'Self Supported': plan('self-hosted-0', 0, 'self-hosted') };
		const result = selectablePlansByTier(selfHosted, { isExistingCluster: true });
		expect(tiers(result)).toEqual(['Self Supported']);
	});

	// Pinned on price, not on the id, so a catalogue rename cannot quietly re-admit a free plan.
	it('drops a renamed free managed plan just the same', () => {
		const renamed = { 'Starter': plan('fabric-block-starter-trial-v2', 0) };
		expect(tiers(selectablePlansByTier(renamed, { isExistingCluster: true }))).toEqual([]);
	});
});
