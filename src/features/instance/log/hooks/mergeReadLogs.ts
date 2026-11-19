import { MAX_READ_LOG_LIMIT, ReadLogItem } from '@/integrations/api/instance/status/getReadLog';

export const LIVE_LOG_BUFFER_FLOOR = 2000;
// Bound cached message copies even when query or table consumers retain old record objects.
let capacity = LIVE_LOG_BUFFER_FLOOR * 3;
let keys = new WeakMap<ReadLogItem, string>();
let slots: WeakRef<ReadLogItem>[] = [];
let cursor = 0;

export function logKey(entry: ReadLogItem): string {
	let key = keys.get(entry);
	if (key === undefined) {
		key = [entry.timestamp, entry.node ?? '', entry.thread ?? '', entry.level, entry.message].map(part => {
			const text = typeof part === 'string' ? part : JSON.stringify(part);
			return text === undefined || text === null ? '-1:' : `${text.length}:${text}`;
		}).join('');
		const expired = slots[cursor]?.deref();
		if (expired) { keys.delete(expired); }
		slots[cursor] = new WeakRef(entry);
		cursor = (cursor + 1) % capacity;
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
	if (limit > 0) {
		const nextCapacity = 3 * Math.max(LIVE_LOG_BUFFER_FLOOR, Math.min(limit, MAX_READ_LOG_LIMIT));
		if (capacity !== nextCapacity) {
			capacity = nextCapacity;
			keys = new WeakMap();
			slots = [];
			cursor = 0;
		}
	}
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
