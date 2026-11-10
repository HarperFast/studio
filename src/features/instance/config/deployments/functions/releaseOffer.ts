import type { ActivationIntent } from '../components/ActivateRelease';
import type { ReleaseCheck } from '../hooks/useComponentReleases';

interface ReleaseOffer {
	intent: ActivationIntent;
	offer: boolean;
	disabled: boolean;
}

/**
 * How to offer activating a release, given what the records suggest and what each node holds. What is on disk wins
 * where it is known (Harper 5.4.0-alpha.1+): a release live on every node has nothing to activate, one live on some
 * nodes is activated again, and one some node holds no copy of is refused there with a 404, so it is not offered.
 *
 * `trustRecords`: whether the records alone decide before Harper 5.4.0-alpha.1, as they do for a staged release. From
 * then on nothing is enabled until `list_releases` answers: retention prunes a stage without a record.
 */
export function releaseOffer(
	check: ReleaseCheck,
	fromRecords: Omit<ReleaseOffer, 'disabled'>,
	trustRecords: boolean,
): ReleaseOffer {
	switch (check.kind) {
		case 'unsupported':
			return trustRecords ? { ...fromRecords, disabled: false } : { ...fromRecords, offer: false, disabled: true };
		case 'unreadable':
		case 'checking':
			return { ...fromRecords, offer: fromRecords.offer && trustRecords, disabled: true };
		case 'live-everywhere':
			return { ...fromRecords, offer: false, disabled: false };
		case 'available':
			return { intent: check.liveOn.length > 0 ? 'again' : fromRecords.intent, offer: true, disabled: false };
		case 'missing':
			return { intent: check.liveOn.length > 0 ? 'again' : fromRecords.intent, offer: true, disabled: true };
	}
}
