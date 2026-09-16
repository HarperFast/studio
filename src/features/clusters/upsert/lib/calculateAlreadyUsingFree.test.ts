import { SchemaPlan } from '@/integrations/api/api.gen';
import { ENTERPRISE, SELF_SERVICE } from '@/integrations/api/orgType';
import { describe, expect, it } from 'vitest';
import { calculateAlreadyUsingFree } from './calculateAlreadyUsingFree';

const plan = (id: string, priceUsd: number) => ({ id, priceUsd } as SchemaPlan);

const planTypes = [
	plan('free-tier', 0),
	plan('self-hosted-free', 0),
	plan('standard', 250),
];

/** An org holding one cluster on the given plan, live unless a status says otherwise. */
const orgWith = (type: string, planId: string, status = 'RUNNING', id = 'cluster-1') => ({
	type,
	clusters: [{ id, status, plans: [{ planId }] }],
});

describe('calculateAlreadyUsingFree', () => {
	it('reports a self-service org that already runs a free cluster', () => {
		expect(calculateAlreadyUsingFree(orgWith(SELF_SERVICE, 'free-tier'), undefined, planTypes)).toBe(true);
	});

	it('lets an enterprise org keep creating free clusters', () => {
		expect(calculateAlreadyUsingFree(orgWith(ENTERPRISE, 'free-tier'), undefined, planTypes)).toBe(false);
	});

	it('does not count a paid cluster', () => {
		expect(calculateAlreadyUsingFree(orgWith(SELF_SERVICE, 'standard'), undefined, planTypes)).toBe(false);
	});

	it('does not count a self-hosted cluster, which is free of charge but unlimited', () => {
		expect(calculateAlreadyUsingFree(orgWith(SELF_SERVICE, 'self-hosted-free'), undefined, planTypes)).toBe(false);
	});

	it('does not count terminated or failed clusters', () => {
		expect(calculateAlreadyUsingFree(orgWith(SELF_SERVICE, 'free-tier', 'TERMINATED'), undefined, planTypes))
			.toBe(false);
		expect(calculateAlreadyUsingFree(orgWith(SELF_SERVICE, 'free-tier', 'FAILED'), undefined, planTypes))
			.toBe(false);
	});

	it('does not count the cluster currently being edited', () => {
		const organization = orgWith(SELF_SERVICE, 'free-tier', 'RUNNING', 'cluster-1');
		expect(calculateAlreadyUsingFree(organization, 'cluster-1', planTypes)).toBe(false);
		expect(calculateAlreadyUsingFree(organization, 'cluster-2', planTypes)).toBe(true);
	});

	it('reports false while the org or the plan list is still loading', () => {
		expect(calculateAlreadyUsingFree(undefined, undefined, planTypes)).toBe(false);
		expect(calculateAlreadyUsingFree(orgWith(SELF_SERVICE, 'free-tier'), undefined, undefined)).toBe(false);
	});
});
