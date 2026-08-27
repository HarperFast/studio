import { Cluster, ClusterGrant, ExpiryStage } from '@/integrations/api/api.patch';

/**
 * What a cluster's grant means for the customer, in one place so the card badge and the cluster
 * banner can't drift apart.
 *
 * The stages come from central-manager's expiry policies: a grant walks WARNED -> FINAL_WARNING ->
 * SHUTDOWN -> DELETED (consumer trial), or adds GRACE before SHUTDOWN (enterprise). The runner
 * stamps `currentStage` as it applies each one.
 */

export type ExpirySeverity = 'info' | 'warning' | 'critical';

export interface GrantExpiryDescription {
	stage: ExpiryStage | 'EXPIRED';
	severity: ExpirySeverity;
	/** Short form for the cluster card. */
	badgeLabel: string;
	/** Sentence form for the cluster page banner. */
	title: string;
	detail?: string;
	/** Service has been withdrawn: buying a plan is the only way back up. */
	needsUpgrade: boolean;
	/** Worth showing a route to the plan editor — true well before service is actually withdrawn. */
	offerUpgrade: boolean;
}

/**
 * Search-param value that tells the cluster editor to open on the Hobbyist plan. The upgrade CTA
 * is a one-click path off an expiring trial, so it lands on the conversion target rather than on
 * whatever the cluster runs today.
 */
export const HOBBYIST_UPGRADE = 'hobbyist';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whether to repeat the warning on a surface the customer is working in, which is every expiry
 * stage — including the first, so nobody reaches the last two days without having seen it.
 *
 * A conversion in flight is the exception: it is progress, not a warning, and the customer is
 * already mid-purchase.
 */
export function isExpiryWarning(description: GrantExpiryDescription | null): boolean {
	return !!description && description.stage !== 'AWAITING_PLAN';
}

/**
 * Whether a start would be refused. Mirrors central-manager's `clusterStartBlockedReason`, which
 * gates on the cluster carrying a `suspendedReason` with no live grant — NOT on the grant alone.
 *
 * Gating UI on "the grant lapsed" instead was wrong in both directions: it hid the container group
 * from a cluster the customer had stopped themselves whose grant later lapsed (a start the server
 * would have accepted), and permanently from one whose grant was revoked, since the expiry runner
 * skips revoked grants and so never writes `suspendedReason`.
 */
export function isStartBlockedByPlan(
	cluster: Pick<Cluster, 'grant' | 'suspendedReason'>,
): boolean {
	return cluster.suspendedReason != null && !cluster.grant?.isActive;
}

/** A conversion that hasn't finished applying its plan yet. Bounded window, not the real terms. */
export function isConversionPending(grant: ClusterGrant | null | undefined): boolean {
	return grant?.expiryPolicy === 'conversion-pending';
}

/**
 * True once a trial->paid conversion has actually landed. The server starts the cluster before it
 * applies the plan, so RUNNING alone is reached while the change is still in flight — the plan
 * landing is what replaces the provisional grant.
 */
export function isConversionComplete(cluster: Pick<Cluster, 'status' | 'grant'>): boolean {
	return cluster.status === 'RUNNING' && !isConversionPending(cluster.grant);
}

/** Whole days from now until `iso`; negative once it has passed. Null if there is no date. */
function daysUntil(iso: string | null, now: number): number | null {
	if (!iso) { return null; }
	const at = new Date(iso).getTime();
	if (Number.isNaN(at)) { return null; }
	// Calendar days, not elapsed 24-hour blocks: rounding up made two hours before midnight read as
	// "ends tomorrow", and that lands inside the final-warning window where the next stage stops the
	// cluster. Comparing local midnights makes "today" mean today.
	return Math.round((startOfDay(at) - startOfDay(now)) / DAY_MS);
}

function startOfDay(at: number): number {
	const day = new Date(at);
	day.setHours(0, 0, 0, 0);
	return day.getTime();
}

function whenPhrase(days: number | null): string {
	if (days == null) { return 'soon'; }
	if (days > 1) { return `in ${days} days`; }
	if (days === 1) { return 'tomorrow'; }
	if (days === 0) { return 'today'; }
	if (days === -1) { return 'yesterday'; }
	return `${Math.abs(days)} days ago`;
}

const SOURCE_LABEL: Record<string, string> = {
	trial: 'Trial',
	comp: 'Complimentary plan',
	gift: 'Complimentary plan',
	enterprise: 'Enterprise agreement',
	purchased: 'Plan',
};

/**
 * When this cluster is due to be deleted, or null if nothing will delete it. Read off the server's
 * schedule rather than guessed from the policy name: stage lists differ per policy (enterprise-grace
 * has five, consumer-trial four) and the day offsets live server-side where they can be edited.
 */
function deletionDueAt(grant: ClusterGrant, now: number): Date | null {
	// The expiry runner skips revoked grants, so their schedule is projected but will never be
	// walked. Promising a deletion date from one would be quoting a timetable nothing runs.
	if (grant.status === 'REVOKED') { return null; }
	const deletion = grant.timeline?.find((entry) => entry.stage === 'DELETED' && !entry.applied);
	if (!deletion?.dueAt) { return null; }
	const at = new Date(deletion.dueAt);
	// A date already past means the runner is behind; "will be deleted on August 23" on August 25
	// reads as a system that has lost track, so say nothing rather than name a stale date.
	return Number.isNaN(at.getTime()) || at.getTime() <= now ? null : at;
}

/** Tense-correct: only claims a past ending when the date actually is in the past. */
function endedTitle(grant: ClusterGrant, days: number | null): string {
	const label = sourceLabel(grant);
	return days == null || days > 0 ? `${label} has ended` : `${label} ended ${whenPhrase(days)}`;
}

const onDate = (at: Date) => new Intl.DateTimeFormat(undefined, { month: 'long', day: 'numeric' }).format(at);

function sourceLabel(grant: ClusterGrant): string {
	return SOURCE_LABEL[grant.source] ?? 'Plan';
}

/**
 * The expiry state worth showing, or null when there is nothing to say — no grant, or a healthy
 * one the runner hasn't staged yet.
 */
export function describeGrantExpiry(
	cluster: Pick<Cluster, 'grant' | 'status' | 'suspendedReason'>,
	now: number = Date.now(),
): GrantExpiryDescription | null {
	const grant = cluster.grant;
	if (!grant) { return null; }

	const days = daysUntil(grant.endsAt, now);
	// Read whether the cluster is really down rather than inferring it from the grant: expiring a
	// grant and stopping a cluster are separate acts, the runner can lag between them, and the
	// enterprise policy separates them by a week.
	const stopped = cluster.status === 'STOPPED' || cluster.suspendedReason != null;

	// A conversion in flight — but only while its provisional grant is still live. Nothing ever
	// rewrites expiryPolicy, so once that window lapses the row still says `conversion-pending`
	// forever; testing it first made a FAILED conversion render as a permanent spinner.
	if (isConversionPending(grant) && grant.isActive) {
		return {
			stage: 'AWAITING_PLAN',
			severity: 'info',
			badgeLabel: 'Upgrading',
			title: 'Your new plan is being applied',
			detail: 'The cluster is starting. This usually takes a few minutes.',
			needsUpgrade: false,
			offerUpgrade: false,
		};
	}

	// GRACE expires the grant but does NOT stop the cluster — the shutdown is a separate stage days
	// later — so it has to be answered before the !isActive branch. Only while the cluster really is
	// up: once it is down, the withdrawn branch below tells the truth and this would not.
	if (grant.currentStage === 'GRACE' && !stopped) {
		return {
			stage: 'GRACE',
			severity: 'warning',
			badgeLabel: 'Grace period',
			title: endedTitle(grant, days),
			detail: 'Your cluster is still running while we sort out renewal. Contact us to continue service.',
			needsUpgrade: false,
			// No self-serve CTA: grace belongs to the enterprise policy, so this is an account with a
			// negotiated agreement. Offering a $20 Hobbyist plan would be the wrong answer to it.
			offerUpgrade: false,
		};
	}

	// isActive, not status: an ACTIVE row past its endsAt is not live until the runner stamps it.
	if (!grant.isActive) {
		const stage = grant.currentStage === 'DELETED'
			? 'DELETED'
			: grant.currentStage === 'SHUTDOWN'
			? 'SHUTDOWN'
			: 'EXPIRED';
		// Nothing deletes a lapsed purchased grant — it carries no policy — so the schedule decides
		// whether deletion is mentioned at all.
		const deletedAt = deletionDueAt(grant, now);
		return {
			stage,
			severity: 'critical',
			badgeLabel: stage === 'DELETED' ? 'Deleted' : 'Plan ended',
			title: stage === 'DELETED'
				? 'This cluster was deleted after its plan ended'
				: endedTitle(grant, days),
			detail: stage === 'DELETED'
				? undefined
				: deletedAt
				? stopped
					? `The cluster has been stopped. It and its data will be deleted on ${
						onDate(deletedAt)
					} unless you choose a paid plan.`
					: `The cluster will be stopped, and it and its data deleted on ${
						onDate(deletedAt)
					}, unless you choose a paid plan.`
				: stopped
				? 'The cluster has been stopped. Choose a paid plan to start it again.'
				: 'The cluster will be stopped shortly. Choose a paid plan to keep it running.',
			needsUpgrade: stage !== 'DELETED',
			offerUpgrade: stage !== 'DELETED',
		};
	}

	switch (grant.currentStage) {
		case 'WARNED':
			return {
				stage: 'WARNED',
				severity: 'warning',
				badgeLabel: `Ends ${whenPhrase(days)}`,
				title: `${sourceLabel(grant)} ends ${whenPhrase(days)}`,
				detail: 'Choose a paid plan to keep this cluster running.',
				needsUpgrade: false,
				offerUpgrade: true,
			};
		case 'FINAL_WARNING':
			return {
				stage: 'FINAL_WARNING',
				severity: 'critical',
				badgeLabel: `Ends ${whenPhrase(days)}`,
				title: `${sourceLabel(grant)} ends ${whenPhrase(days)}`,
				detail: 'The cluster will be stopped when it ends. Choose a paid plan to keep it running.',
				needsUpgrade: false,
				offerUpgrade: true,
			};
		default:
			return null;
	}
}
