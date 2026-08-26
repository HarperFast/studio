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
}

const DAY_MS = 24 * 60 * 60 * 1000;

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
	return Math.ceil((at - now) / DAY_MS);
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

function sourceLabel(grant: ClusterGrant): string {
	return SOURCE_LABEL[grant.source] ?? 'Plan';
}

/**
 * The expiry state worth showing, or null when there is nothing to say — no grant, or a healthy
 * one the runner hasn't staged yet.
 */
export function describeGrantExpiry(
	cluster: Pick<Cluster, 'grant'>,
	now: number = Date.now(),
): GrantExpiryDescription | null {
	const grant = cluster.grant;
	if (!grant) { return null; }

	// A conversion mid-flight is a bounded window, not the customer's terms — never dressed up as
	// an expiring plan, or an upgrade in progress would read as a warning.
	if (isConversionPending(grant)) {
		return {
			stage: 'AWAITING_PLAN',
			severity: 'info',
			badgeLabel: 'Upgrading',
			title: 'Your new plan is being applied',
			detail: 'The cluster is starting. This usually takes a few minutes.',
			needsUpgrade: false,
		};
	}

	const days = daysUntil(grant.endsAt, now);

	// isActive, not status: an ACTIVE row past its endsAt is not live until the runner stamps it.
	if (!grant.isActive) {
		const stage = grant.currentStage === 'DELETED'
			? 'DELETED'
			: grant.currentStage === 'SHUTDOWN'
			? 'SHUTDOWN'
			: 'EXPIRED';
		return {
			stage,
			severity: 'critical',
			badgeLabel: stage === 'DELETED' ? 'Deleted' : 'Plan ended',
			title: stage === 'DELETED'
				? 'This cluster was deleted after its plan ended'
				: `${sourceLabel(grant)} ended ${whenPhrase(days)}`,
			detail: stage === 'DELETED'
				? undefined
				: 'The cluster has been stopped. Choose a paid plan to start it again.',
			needsUpgrade: stage !== 'DELETED',
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
			};
		case 'FINAL_WARNING':
			return {
				stage: 'FINAL_WARNING',
				severity: 'critical',
				badgeLabel: `Ends ${whenPhrase(days)}`,
				title: `${sourceLabel(grant)} ends ${whenPhrase(days)}`,
				detail: 'The cluster will be stopped when it ends. Choose a paid plan to keep it running.',
				needsUpgrade: false,
			};
		case 'GRACE':
			return {
				stage: 'GRACE',
				severity: 'critical',
				badgeLabel: 'Grace period',
				title: `${sourceLabel(grant)} ended ${whenPhrase(days)}`,
				detail: 'The cluster is still running while we sort out renewal. Contact us to continue service.',
				needsUpgrade: false,
			};
		// The runner stamps these only alongside a stop/delete, so isActive is false above and this
		// is unreachable in practice — kept so a stage that outlives its grant still renders.
		case 'SHUTDOWN':
		case 'DELETED':
			return {
				stage: grant.currentStage,
				severity: 'critical',
				badgeLabel: 'Plan ended',
				title: `${sourceLabel(grant)} has ended`,
				detail: 'Choose a paid plan to start this cluster again.',
				needsUpgrade: grant.currentStage !== 'DELETED',
			};
		default:
			return null;
	}
}
