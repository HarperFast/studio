import { ClusterGrant } from '@/integrations/api/api.patch';
import { describe, expect, it } from 'vitest';
import { describeGrantExpiry, isConversionComplete, isConversionPending, isExpiryWarning } from './grantExpiry';

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
		timeline: null,
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

	// The upgrade route is the point of the warning stages — it must not wait for the shutdown.
	it('offers an upgrade well before service is withdrawn', () => {
		for (const stage of ['WARNED', 'FINAL_WARNING'] as const) {
			const result = describeGrantExpiry({ grant: grant({ currentStage: stage, endsAt: daysFromNow(3) }) }, NOW);
			expect({ stage, offerUpgrade: result?.offerUpgrade }).toEqual({ stage, offerUpgrade: true });
			// Still running: an upgrade is available, but nothing needs restoring.
			expect(result?.needsUpgrade).toBe(false);
		}
	});

	// GRACE only exists on the enterprise policy, so the account has a negotiated agreement. A $20
	// self-serve CTA is the wrong answer to it, and the copy says to contact us instead.
	it('offers no self-serve upgrade during an enterprise grace period', () => {
		const inGrace = grant({ isActive: false, expiryPolicy: 'enterprise-grace', currentStage: 'GRACE' });
		const result = describeGrantExpiry({ grant: inGrace, status: 'RUNNING' }, NOW);
		expect(result).toMatchObject({ stage: 'GRACE', offerUpgrade: false, needsUpgrade: false });
		expect(result?.detail).toContain('Contact us');
	});

	it('offers no upgrade once the cluster is deleted or while a conversion is settling', () => {
		const deleted = grant({ isActive: false, status: 'EXPIRED', currentStage: 'DELETED' });
		expect(describeGrantExpiry({ grant: deleted }, NOW)?.offerUpgrade).toBe(false);

		const converting = grant({ source: 'purchased', expiryPolicy: 'conversion-pending' });
		expect(describeGrantExpiry({ grant: converting }, NOW)?.offerUpgrade).toBe(false);
	});

	// The bug this covers: GRACE runs expireGrant but NOT stopCluster — the shutdown is a separate
	// stage days later — so a running cluster in its grace period was being told it had been stopped.
	it('does not claim a grace-period cluster has been stopped', () => {
		const inGrace = grant({
			isActive: false,
			status: 'EXPIRED',
			expiryPolicy: 'enterprise-grace',
			currentStage: 'GRACE',
			endsAt: daysFromNow(0),
		});
		const result = describeGrantExpiry({ grant: inGrace, status: 'RUNNING' }, NOW);
		expect(result).toMatchObject({ stage: 'GRACE', severity: 'warning', needsUpgrade: false });
		expect(result?.detail).toContain('still running');
		expect(result?.detail).not.toContain('has been stopped');
	});

	// The runner expires the grant and stops the cluster in one stage, but it can lag behind.
	it('says the cluster will stop, not that it has, while it is still running', () => {
		const lagging = grant({ isActive: false, status: 'EXPIRED', currentStage: null, endsAt: daysFromNow(-1) });
		const result = describeGrantExpiry({ grant: lagging, status: 'RUNNING' }, NOW);
		expect(result?.detail).toContain('will be stopped');
		expect(result?.detail).not.toContain('has been stopped');
	});

	it('says the cluster has been stopped once it actually is', () => {
		const shutdown = grant({ isActive: false, status: 'EXPIRED', currentStage: 'SHUTDOWN', endsAt: daysFromNow(-1) });
		const stopped = describeGrantExpiry({ grant: shutdown, status: 'STOPPED' }, NOW);
		expect(stopped?.detail).toContain('has been stopped');
		// suspendedReason alone is enough — it is what marks a withdrawal rather than a user stop.
		const suspended = describeGrantExpiry({ grant: shutdown, status: 'RUNNING', suspendedReason: 'PLAN_ENDED' }, NOW);
		expect(suspended?.detail).toContain('has been stopped');
	});

	// Data loss is the real stake of a shut-down trial, and a date is what makes it actionable.
	it('names the deletion date from the server schedule', () => {
		const shutdown = grant({
			isActive: false,
			status: 'EXPIRED',
			expiryPolicy: 'consumer-trial',
			currentStage: 'SHUTDOWN',
			endsAt: daysFromNow(-7),
			timeline: [
				{ stage: 'SHUTDOWN', dueAt: daysFromNow(-7), applied: true },
				{ stage: 'DELETED', dueAt: daysFromNow(7), applied: false },
			],
		});
		const detail = describeGrantExpiry({ grant: shutdown, status: 'STOPPED' }, NOW)?.detail;
		expect(detail).toContain('will be deleted on');
		expect(detail).toContain(
			new Intl.DateTimeFormat(undefined, { month: 'long', day: 'numeric' }).format(new Date(daysFromNow(7))),
		);
		expect(detail).toContain('data');
	});

	// Five stages, not four — most trial grants are on enterprise-grace, so nothing may assume shape.
	it('finds the deletion stage wherever it sits in the policy', () => {
		const enterprise = grant({
			isActive: false,
			expiryPolicy: 'enterprise-grace',
			currentStage: 'SHUTDOWN',
			timeline: [
				{ stage: 'WARNED', dueAt: daysFromNow(-21), applied: true },
				{ stage: 'FINAL_WARNING', dueAt: daysFromNow(-16), applied: true },
				{ stage: 'GRACE', dueAt: daysFromNow(-14), applied: true },
				{ stage: 'SHUTDOWN', dueAt: daysFromNow(-7), applied: true },
				{ stage: 'DELETED', dueAt: daysFromNow(14), applied: false },
			],
		});
		expect(describeGrantExpiry({ grant: enterprise, status: 'STOPPED' }, NOW)?.detail).toContain('will be deleted on');
	});

	// A lapsed purchased grant carries no policy, so nothing deletes it — saying otherwise is a lie.
	it('does not threaten deletion when the schedule has none', () => {
		const lapsed = grant({ source: 'purchased', isActive: false, expiryPolicy: null, currentStage: 'SHUTDOWN' });
		const detail = describeGrantExpiry({ grant: lapsed, status: 'STOPPED' }, NOW)?.detail;
		expect(detail).toContain('has been stopped');
		expect(detail).not.toContain('deleted');
	});

	// Timeline is null for a forever grant or an unparseable endsAt; the copy stays true without it.
	it('falls back to the undated wording when there is no schedule', () => {
		const noSchedule = grant({ isActive: false, currentStage: 'SHUTDOWN', timeline: null });
		expect(describeGrantExpiry({ grant: noSchedule, status: 'STOPPED' }, NOW)?.detail).toBe(
			'The cluster has been stopped. Choose a paid plan to start it again.',
		);
	});

	// B2: nothing ever rewrites expiryPolicy, so a lapsed provisional grant still reads
	// `conversion-pending`. Testing that before isActive rendered a failed conversion as a spinner
	// with no CTA, permanently — not for the four-hour window, forever.
	it('reports a failed conversion as ended, not as still upgrading', () => {
		const failed = grant({
			source: 'purchased',
			isActive: false,
			status: 'EXPIRED',
			expiryPolicy: 'conversion-pending',
			currentStage: 'SHUTDOWN',
			endsAt: daysFromNow(-1),
		});
		const result = describeGrantExpiry({ grant: failed, status: 'STOPPED' }, NOW);
		expect(result?.stage).not.toBe('AWAITING_PLAN');
		expect(result).toMatchObject({ severity: 'critical', needsUpgrade: true });
	});

	it('still shows a live conversion as upgrading', () => {
		const live = grant({ source: 'purchased', isActive: true, expiryPolicy: 'conversion-pending' });
		expect(describeGrantExpiry({ grant: live, status: 'STARTING' }, NOW)?.stage).toBe('AWAITING_PLAN');
	});

	// S8: the mirror of the grace bug already fixed once — asserting a state instead of reading it.
	// It must READ the status without leaving the grace arm: falling through to the withdrawn copy
	// told an enterprise account mid-renewal to buy a $20 self-serve plan.
	it('reads the status during grace without handing an enterprise account a self-serve upsell', () => {
		const inGrace = grant({ isActive: false, expiryPolicy: 'enterprise-grace', currentStage: 'GRACE' });
		const result = describeGrantExpiry({ grant: inGrace, status: 'STOPPED' }, NOW);
		expect(result).toMatchObject({ stage: 'GRACE', offerUpgrade: false, needsUpgrade: false });
		expect(result?.detail).toContain('stopped while we sort out renewal');
		expect(result?.detail).toContain('Contact us');
	});

	// S5: reachable via a revoked forever-grant (endsAt null) and via a future startsAt.
	it('does not claim a past ending when the date is absent or still ahead', () => {
		const forever = grant({ source: 'comp', isActive: false, status: 'REVOKED', endsAt: null });
		expect(describeGrantExpiry({ grant: forever, status: 'STOPPED' }, NOW)?.title).toBe('Complimentary plan has ended');

		const future = grant({ source: 'comp', isActive: false, endsAt: daysFromNow(30) });
		expect(describeGrantExpiry({ grant: future, status: 'STOPPED' }, NOW)?.title).toBe('Complimentary plan has ended');
	});

	// S4: the runner skips revoked grants, so their schedule is never walked.
	it('quotes no deletion date for a revoked grant', () => {
		const revoked = grant({
			isActive: false,
			status: 'REVOKED',
			currentStage: 'SHUTDOWN',
			timeline: [{ stage: 'DELETED', dueAt: daysFromNow(7), applied: false }],
		});
		expect(describeGrantExpiry({ grant: revoked, status: 'STOPPED' }, NOW)?.detail).not.toContain('deleted on');
	});

	// S6: a date already past means the runner is behind; naming it reads as a system losing track.
	it('quotes no deletion date that has already passed', () => {
		const stale = grant({
			isActive: false,
			currentStage: 'SHUTDOWN',
			timeline: [{ stage: 'DELETED', dueAt: daysFromNow(-2), applied: false }],
		});
		expect(describeGrantExpiry({ grant: stale, status: 'STOPPED' }, NOW)?.detail).not.toContain('deleted on');
	});

	// S7: rounding up put two hours before midnight into "tomorrow", inside the window where the
	// next stage stops the cluster.
	it('counts calendar days, so hours left today read as today', () => {
		const hoursLeft = new Date(NOW + 2 * 60 * 60 * 1000);
		const nearlyUp = grant({ currentStage: 'FINAL_WARNING', endsAt: hoursLeft.toISOString() });
		const sameDay = hoursLeft.getDate() === new Date(NOW).getDate();
		expect(describeGrantExpiry({ grant: nearlyUp }, NOW)?.title).toBe(
			sameDay ? 'Trial ends today' : 'Trial ends tomorrow',
		);
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

describe('isExpiryWarning', () => {
	const at = (overrides: Partial<ClusterGrant>) => describeGrantExpiry({ grant: grant(overrides) }, NOW);

	// Every stage warns, first one included, so nobody reaches the last two days having seen nothing.
	it('warns from the first stage onward', () => {
		expect(isExpiryWarning(at({ currentStage: 'WARNED', endsAt: daysFromNow(6) }))).toBe(true);
		expect(isExpiryWarning(at({ currentStage: 'FINAL_WARNING', endsAt: daysFromNow(2) }))).toBe(true);
		expect(isExpiryWarning(at({ isActive: false, currentStage: 'GRACE', endsAt: daysFromNow(0) }))).toBe(true);
		expect(isExpiryWarning(at({ isActive: false, currentStage: 'SHUTDOWN', endsAt: daysFromNow(-1) }))).toBe(true);
	});

	// A lapsed grant the runner has not staged yet still means service is gone.
	it('warns on an expired grant with no stage stamped', () => {
		expect(isExpiryWarning(at({ isActive: false, currentStage: null, endsAt: daysFromNow(-1) }))).toBe(true);
	});

	// The customer is mid-purchase; an upgrade in progress is not something to warn them about.
	it('stays quiet for a healthy cluster, no grant, or a conversion in flight', () => {
		expect(isExpiryWarning(at({}))).toBe(false);
		expect(isExpiryWarning(describeGrantExpiry({ grant: null }, NOW))).toBe(false);
		expect(isExpiryWarning(at({ expiryPolicy: 'conversion-pending' }))).toBe(false);
	});
});
