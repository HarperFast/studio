import { ReadLogItem } from '@/integrations/api/instance/status/getReadLog';

const keys = new WeakMap<ReadLogItem, string>();

export function logKey(entry: ReadLogItem): string {
	let key = keys.get(entry);
	if (key === undefined) {
		key = JSON.stringify([entry.timestamp, entry.node ?? '', entry.thread ?? '', entry.level, entry.message]);
		keys.set(entry, key);
	}
	return key;
}

/** Deduplicate overlapping snapshots/tails and order newest first. A nonpositive limit is uncapped. */
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
