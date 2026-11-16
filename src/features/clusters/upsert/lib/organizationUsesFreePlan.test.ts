import type { Cluster } from '@/integrations/api/api.patch';
import { describe, expect, it } from 'vitest';
import { organizationUsesFreePlan } from './organizationUsesFreePlan';

const PLANS = [{ id: 'free', priceUsd: 0 }, { id: 'paid', priceUsd: 40 }, { id: 'self-hosted-free', priceUsd: 0 }];
const cluster = (id: string, status: string | undefined, planId = 'free', extra: Partial<Cluster> = {}): Cluster =>
	({ id, name: id, organizationId: 'org-a', status, plans: [{ planId }], ...extra }) as Cluster;

describe(organizationUsesFreePlan, () => {
	it('finds a live cluster on the free plan, by any plan it holds', () => {
		expect(organizationUsesFreePlan([cluster('a', 'RUNNING')], PLANS)).toBe(true);
		expect(
			organizationUsesFreePlan(
				[cluster('a', 'STOPPED', 'paid', { plans: [{ planId: 'paid' }, { planId: 'free' }] })],
				PLANS,
			),
		)
			.toBe(true);
		expect(organizationUsesFreePlan([cluster('a', 'RUNNING', 'paid')], PLANS)).toBe(false);
	});

	it('leaves out a cluster being deleted as it does a deleted one: central manager frees the plan at admission', () => {
		for (const status of ['TERMINATING', 'TERMINATED', 'REMOVED']) {
			expect(organizationUsesFreePlan([cluster('a', status)], PLANS), status).toBe(false);
		}
		expect(
			organizationUsesFreePlan([cluster('a', 'FAILED', 'free', { terminatedAt: '2026-11-06T00:00:00.000Z' })], PLANS),
		)
			.toBe(false);
	});

	it('still counts a FAILED cluster that was not torn down, whose instances may serve, as central manager does', () => {
		expect(organizationUsesFreePlan([cluster('a', 'FAILED')], PLANS)).toBe(true);
	});

	it('leaves out the cluster being edited, a self-hosted free plan, and an unknown plan catalog', () => {
		expect(organizationUsesFreePlan([cluster('a', 'RUNNING')], PLANS, 'a')).toBe(false);
		expect(organizationUsesFreePlan([cluster('a', 'RUNNING', 'self-hosted-free')], PLANS)).toBe(false);
		expect(organizationUsesFreePlan([cluster('a', 'RUNNING')], undefined)).toBe(false);
		expect(organizationUsesFreePlan(undefined, PLANS)).toBe(false);
		expect(organizationUsesFreePlan([cluster('a', 'RUNNING', 'free', { plans: undefined })], PLANS)).toBe(false);
	});
});
