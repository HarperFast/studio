import { ReadLogItem } from '@/integrations/api/instance/status/getReadLog';

const keys = new WeakMap<ReadLogItem, string>();

/** Shared identity across snapshots, live replay, and expanded rows. */
export function logKey(entry: ReadLogItem): string {
	let key = keys.get(entry);
	if (key === undefined) {
		key = JSON.stringify([entry.timestamp, entry.node ?? '', entry.thread ?? '', entry.level, entry.message]);
		keys.set(entry, key);
	}
	return key;
}

/**
 * Merge the buffered snapshot with entries received over the live tail into a single
 * newest-first list, de-duplicated (the two sources overlap: the tail may replay recent
 * lines that the snapshot already holds) and capped at `limit`.
 *
 * Both inputs are expected newest-first already; we still sort defensively by timestamp so
 * an out-of-order arrival cannot wedge a line into the wrong place. Ties keep first-seen
 * order, and since `live` is scanned before `snapshot`, a replayed line prefers the tail's
 * copy (which is the one carrying any freshly-attached `node`, etc.).
 */
export function mergeReadLogs(
	snapshot: ReadLogItem[],
	live: ReadLogItem[],
	limit: number,
): ReadLogItem[] {
	const seen = new Set<string>();
	const merged: ReadLogItem[] = [];
	for (const entry of [...live, ...snapshot]) {
		const key = logKey(entry);
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		merged.push(entry);
	}
	merged.sort((a, b) => (a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0));
	return limit > 0 && merged.length > limit ? merged.slice(0, limit) : merged;
}
