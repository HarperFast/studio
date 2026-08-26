import { ClusterGrant } from '@/integrations/api/api.patch';
import { describe, expect, it } from 'vitest';
import { describeGrantExpiry, isConversionComplete, isConversionPending } from './grantExpiry';

const NOW = new Date('2026-08-25T12:00:00.000Z').getTime();
const daysFromNow = (days: number) => new Date(NOW + days * 24 * 60 * 60 * 1000).toISOString();

function grant(overrides: Partial<ClusterGrant> = {}): ClusterGrant {
	return {
		id: 'cgr-test',
		source: 'trial',
		status: 'ACTIVE',
		isActive: true,
		startsAt: daysFromNow(-30),
		endsAt: daysFromNow(30),
		cycleAnchor: null,
		expiryPolicy: 'consumer-trial',
		currentStage: null,
		stageUpdatedAt: null,
		allowedPlanIds: null,
		allowedRegionIds: null,
		...overrides,
	};
}

describe('describeGrantExpiry', () => {
	it('says nothing for a cluster that never had a grant', () => {
		expect(describeGrantExpiry({ grant: null }, NOW)).toBeNull();
		expect(describeGrantExpiry({}, NOW)).toBeNull();
	});

	it('says nothing for a live grant the runner has not staged', () => {
		expect(describeGrantExpiry({ grant: grant() }, NOW)).toBeNull();
	});

	it('warns with a countdown at WARNED', () => {
		const result = describeGrantExpiry({ grant: grant({ currentStage: 'WARNED', endsAt: daysFromNow(5) }) }, NOW);
		expect(result).toMatchObject({ stage: 'WARNED', severity: 'warning', needsUpgrade: false });
		expect(result?.title).toBe('Trial ends in 5 days');
	});

	it('escalates to critical at FINAL_WARNING without claiming service has ended', () => {
		const result = describeGrantExpiry(
			{ grant: grant({ currentStage: 'FINAL_WARNING', endsAt: daysFromNow(2) }) },
			NOW,
		);
		expect(result).toMatchObject({ stage: 'FINAL_WARNING', severity: 'critical', needsUpgrade: false });
		expect(result?.title).toBe('Trial ends in 2 days');
	});

	it('treats an expired grant as needing an upgrade, and dates it in the past', () => {
		const result = describeGrantExpiry(
			{ grant: grant({ isActive: false, status: 'EXPIRED', currentStage: 'SHUTDOWN', endsAt: daysFromNow(-3) }) },
			NOW,
		);
		expect(result).toMatchObject({ stage: 'SHUTDOWN', severity: 'critical', needsUpgrade: true });
		expect(result?.title).toBe('Trial ended 3 days ago');
	});

	// The whole reason the projection exposes isActive: an ACTIVE row past its endsAt is not live
	// until the runner stamps it, so trusting `status` would report a dead cluster as healthy.
	it('trusts isActive over status for a grant the runner has not caught up with', () => {
		const stale = grant({ status: 'ACTIVE', isActive: false, currentStage: null, endsAt: daysFromNow(-1) });
		const result = describeGrantExpiry({ grant: stale }, NOW);
		expect(result).toMatchObject({ stage: 'EXPIRED', severity: 'critical', needsUpgrade: true });
	});

	it('does not offer an upgrade for a deleted cluster', () => {
		const result = describeGrantExpiry(
			{ grant: grant({ isActive: false, status: 'EXPIRED', currentStage: 'DELETED' }) },
			NOW,
		);
		expect(result).toMatchObject({ stage: 'DELETED', needsUpgrade: false });
	});

	it('renders a mid-flight conversion as progress, not as an expiry warning', () => {
		const converting = grant({ source: 'purchased', expiryPolicy: 'conversion-pending', endsAt: daysFromNow(0) });
		const result = describeGrantExpiry({ grant: converting }, NOW);
		expect(result).toMatchObject({ stage: 'AWAITING_PLAN', severity: 'info', needsUpgrade: false });
	});

	// A lapsed conversion window would otherwise read as "upgrading" forever.
	it('reports a lapsed conversion window as ended once the grant is no longer active', () => {
		const lapsed = grant({ source: 'purchased', expiryPolicy: null, isActive: false, endsAt: daysFromNow(-1) });
		expect(describeGrantExpiry({ grant: lapsed }, NOW)).toMatchObject({ needsUpgrade: true });
	});

	it('names the grant source so a comped cluster does not read as a trial', () => {
		const comp = grant({ source: 'comp', currentStage: 'WARNED', endsAt: daysFromNow(4) });
		expect(describeGrantExpiry({ grant: comp }, NOW)?.title).toBe('Complimentary plan ends in 4 days');
	});

	it('survives a malformed date rather than rendering NaN', () => {
		const broken = grant({ currentStage: 'WARNED', endsAt: 'not-a-date' });
		expect(describeGrantExpiry({ grant: broken }, NOW)?.title).toBe('Trial ends soon');
	});
});

describe('isConversionComplete', () => {
	it('is false while the cluster is still starting', () => {
		expect(isConversionComplete({ status: 'STARTING', grant: grant({ expiryPolicy: 'conversion-pending' }) })).toBe(
			false,
		);
	});

	// The server starts the cluster before applying the plan, so RUNNING alone is reached while the
	// conversion is still in flight. Announcing completion here is what the old /scaling screen did.
	it('is false when the cluster is RUNNING but the plan has not landed yet', () => {
		expect(isConversionComplete({ status: 'RUNNING', grant: grant({ expiryPolicy: 'conversion-pending' }) })).toBe(
			false,
		);
	});

	it('is true once the provisional grant has been replaced', () => {
		expect(isConversionComplete({ status: 'RUNNING', grant: grant({ source: 'purchased', expiryPolicy: null }) })).toBe(
			true,
		);
	});

	it('is true for a normal update on a cluster with no grant', () => {
		expect(isConversionComplete({ status: 'RUNNING', grant: null })).toBe(true);
	});
});

describe('isConversionPending', () => {
	it('is false for null, undefined and ordinary grants', () => {
		expect(isConversionPending(null)).toBe(false);
		expect(isConversionPending(undefined)).toBe(false);
		expect(isConversionPending(grant())).toBe(false);
	});
});
