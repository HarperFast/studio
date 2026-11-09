import type {
	ClusterMonitoringPolicyRow,
	MonitoringPolicyProjectionError,
} from '@/features/admin/monitoring/monitoringPolicyApi';
import { toMs } from '@/features/notifications/notificationHelpers';

/**
 * Past this, a change whose checks were never confirmed is reported as stuck. Central manager re-runs a
 * lost projection once the change is ten minutes old and sweeps every five, so by twenty both chances
 * have passed.
 */
export const STUCK_AFTER_MS = 20 * 60 * 1000;

export type CheckStatus =
	| { state: 'pending'; since: number | null; stuck: boolean }
	| { state: 'skipped'; gate: string; at: number }
	| { state: 'errors'; errors: MonitoringPolicyProjectionError[]; at: number }
	| { state: 'applied'; at: number };

/**
 * Whether the cluster's synthetic checks carry its latest change. Only an attempt that finished after the
 * change counts: the row keeps the previous attempt's outcome until the new one finishes, so reading its
 * `skipped` or `errors` first would report a stale result against the new change.
 */
export function checkStatus(
	row: Pick<ClusterMonitoringPolicyRow, 'setAt' | 'checkProjection'>,
	now = Date.now(),
): CheckStatus {
	const setAt = toMs(row.setAt);
	const projection = row.checkProjection;
	const finishedAt = toMs(projection?.finishedAt);
	const pending = (): CheckStatus => ({
		state: 'pending',
		since: setAt,
		stuck: setAt !== null && now - setAt >= STUCK_AFTER_MS,
	});
	if (!projection || finishedAt === null || setAt === null || finishedAt < setAt) {
		return pending();
	}
	// A skip keeps the previous projected setAt, so only its finish time can tie it to this change.
	if (projection.skipped) {
		return { state: 'skipped', gate: projection.skipped, at: finishedAt };
	}
	// Finished after the change but projected an older one (a newer change outran its passes, or a sweep
	// for the previous change): its outcome, errors included, is not this change's.
	if (toMs(projection.setAt) !== setAt) {
		return pending();
	}
	if (projection.errors?.length) {
		return { state: 'errors', errors: projection.errors, at: finishedAt };
	}
	return { state: 'applied', at: finishedAt };
}
