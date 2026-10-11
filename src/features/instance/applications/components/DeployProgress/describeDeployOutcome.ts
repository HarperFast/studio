import { CertificationDecision } from '@/integrations/api/instance/applications/deployOutcome';
import { RolloutNode, RolloutSnapshot } from '@/integrations/api/instance/applications/restartJob';

export interface CertificationSummary {
	label: string;
	/** Why it went out unchecked, when it did. */
	detail?: string;
	certified: boolean;
}

/** Harper's `certification` string (5.4.0+), as a person reads it. */
export function describeCertification(certification: string): CertificationSummary {
	switch (certification) {
		case 'certified':
			return { label: 'Certified', detail: 'Its canary loaded the release before it served.', certified: true };
		case 'uncertified':
			return {
				label: 'Not certified',
				detail: 'It went out unchecked: the component ran nothing as it loaded (dev-only loading, an absent '
					+ 'if-installed component, or safe mode), or no worker was replaced.',
				certified: false,
			};
		case 'unavailable':
			return {
				label: 'Not certified',
				detail: 'It restarted unchecked: no worker on this node loads the component, its isolated setting '
					+ 'changed with this deploy, it was already live, or it was deployed from a local directory.',
				certified: false,
			};
		case 'not-requested':
			return { label: 'Not certified', detail: 'The deploy did not restart, so nothing checked it.', certified: false };
		default:
			return { label: `Not certified (${certification})`, certified: false };
	}
}

export interface DecisionSummary {
	title: string;
	reason?: string;
	outcome?: string;
}

/** A canary's refusal of a release on the node that received the deploy. */
export function describeDecision(decision: CertificationDecision): DecisionSummary {
	const title = decision.status === 'rejected'
		? 'Its canary rejected this release on the node that received the deploy.'
		: decision.status === 'interrupted'
		? 'Its restart stopped before the canary decided, on the node that received the deploy.'
		: `It was not certified (${decision.status}) on the node that received the deploy.`;
	const outcome = decision.restored
		? `Deployment ${decision.restored}, the release it replaced, is live there again.`
		: decision.failedClosed
		? 'There was no earlier release to restore, so the component is failed closed there until it is deployed again.'
		: undefined;
	return { title, reason: decision.reason, outcome };
}

/** Why Studio could not say how the other nodes took the release. */
export function describeUnfollowable(rollout: RolloutSnapshot): string | undefined {
	switch (rollout.unfollowable) {
		case 'not-found':
			return "Studio couldn't find this deploy's restart job on the node it reached, so it can't tell how the "
				+ 'other nodes took the release. Check their status before relying on it.';
		case 'refused':
			return "Studio couldn't read this deploy's restart job, so it can't tell how the other nodes took the "
				+ 'release. Check their status before relying on it.';
		case 'timed-out':
			return 'The other nodes were still restarting after 30 minutes, so Studio stopped waiting. The restart may '
				+ 'still finish; check their status before relying on it.';
	}
	return undefined;
}

/** One node's line in the rollout list. */
export function describeRolloutNode(node: RolloutNode): { label: string; detail?: string } {
	switch (node.outcome) {
		case 'activated':
			return node.certification
				? { label: describeCertification(node.certification).label }
				: { label: 'Took the release' };
		case 'restarted':
			return { label: 'Restarted' };
		case 'failed':
			return { label: 'Did not take the release', detail: node.detail };
		case 'unconfirmed':
			return { label: 'Restart not confirmed', detail: node.detail };
	}
}
