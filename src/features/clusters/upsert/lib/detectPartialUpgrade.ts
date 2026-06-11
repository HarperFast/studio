import { compareVersions } from '@/lib/string/wasAReleasedBeforeB';

export interface PartialUpgrade {
	/** The highest version reported across the cluster — the version lagging instances should reach. */
	latest: string;
	/** How many instances are still on a version older than `latest`. */
	behindCount: number;
	/** Total number of instances reporting a version. */
	total: number;
}

/**
 * Given the versions reported by a cluster's instances, detect whether the cluster is in a
 * partially-upgraded state — i.e. at least one instance is on an older version than the rest.
 *
 * This happens when an upgrade succeeds on some instances but fails on others: the failed instance
 * stays on the old version while the rest move to the target. The version picker treats the highest
 * version as "current" and offers nothing newer, so there is otherwise no way to re-run the upgrade
 * for the lagging instances.
 *
 * Returns the target version, how many instances are behind it, and the total reporting a version.
 * Returns null when the cluster is uniform (or fewer than two instances report a version), since
 * there is nothing to re-run.
 */
export function detectPartialUpgrade(versions: Array<string | undefined | null>): PartialUpgrade | null {
	const reported = versions.filter((v): v is string => !!v);
	if (reported.length < 2) {
		return null;
	}
	const latest = reported.reduce((max, v) => compareVersions(v, max) > 0 ? v : max);
	const behindCount = reported.filter(v => v !== latest).length;
	return behindCount > 0 ? { latest, behindCount, total: reported.length } : null;
}
