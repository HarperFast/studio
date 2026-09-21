import { describe, expect, it } from 'vitest';
import { ClusterUsage, usageSubtitle } from './getClusterUsage';

const usage = (regions: number): ClusterUsage =>
	({
		clusterId: 'clu-1',
		selfManaged: false,
		renewsAt: '2026-10-18T00:00:00.000Z',
		totals: null,
		mostConstrained: null,
		regions: Array.from({ length: regions }, () => ({ planName: 'Hobbyist' })),
	}) as unknown as ClusterUsage;

describe('usageSubtitle', () => {
	it('says renews for a paid plan', () => {
		expect(usageSubtitle(usage(1))).toMatch(/^Hobbyist plan · renews /);
	});

	// A trial's block expiry is the trial's end; "renews" would promise a charge and a continuation
	// the server deliberately does not project.
	it('says ends for a trial', () => {
		expect(usageSubtitle(usage(1), { trial: true })).toMatch(/^Hobbyist plan · ends /);
		expect(usageSubtitle(usage(2), { trial: true })).toMatch(/ends /);
	});
});
