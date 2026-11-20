import { ReadLogItem } from '@/integrations/api/instance/status/getReadLog';

export const LIVE_LOG_BUFFER_FLOOR = 2000;
type Identity = { id: string; references: Set<WeakRef<ReadLogItem>> };
const identities = new Map<string, Map<string, Identity>>();
const keys = new WeakMap<ReadLogItem, string>();
const occurrences = new WeakMap<ReadLogItem, number>();
const copies = new WeakMap<ReadLogItem, { index: number; entry: ReadLogItem }>();
let nextIdentity = 0;
const collected = new FinalizationRegistry<{
	metadata: string;
	message: string;
	identity: Identity;
	reference: WeakRef<ReadLogItem>;
}>(({ metadata, message, identity, reference }) => {
	identity.references.delete(reference);
	if (identity.references.size) { return; }
	const messages = identities.get(metadata);
	if (messages?.get(message) !== identity) { return; }
	messages.delete(message);
	if (!messages.size) { identities.delete(metadata); }
});

function contentKey(entry: ReadLogItem): string {
	const cached = keys.get(entry);
	if (cached !== undefined) { return cached; }
	const metadata = JSON.stringify([
		entry.timestamp,
		entry.node ?? '',
		entry.thread ?? '',
		entry.level,
		entry.tags ?? [],
	]);
	const message = entry.message;
	let messages = identities.get(metadata);
	if (!messages) { identities.set(metadata, messages = new Map()); }
	let identity = messages.get(message);
	if (!identity) {
		identity = { id: `event-${++nextIdentity}`, references: new Set() };
		messages.set(message, identity);
	}
	const reference = new WeakRef(entry);
	identity.references.add(reference);
	collected.register(entry, { metadata, message, identity, reference });
	keys.set(entry, identity.id);
	return identity.id;
}

export function logKey(entry: ReadLogItem): string {
	return `${contentKey(entry)}:${occurrences.get(entry) ?? 0}`;
}

function occurrence(entry: ReadLogItem, index: number): ReadLogItem {
	if ((occurrences.get(entry) ?? 0) === index) { return entry; }
	const cached = copies.get(entry);
	if (cached?.index === index) { return cached.entry; }
	const copy = { ...entry };
	copies.set(entry, { index, entry: copy });
	occurrences.set(copy, index);
	contentKey(copy);
	return copy;
}

/** Preserve repeated emissions within a source; reconcile only overlapping snapshot/tail occurrences. */
export function mergeReadLogs(snapshot: ReadLogItem[], live: ReadLogItem[], limit: number): ReadLogItem[] {
	const liveCounts = new Map<string, number>();
	const snapshotCounts = new Map<string, number>();
	const merged: ReadLogItem[] = [];
	for (const entry of live) {
		const key = contentKey(entry);
		const index = liveCounts.get(key) ?? 0;
		liveCounts.set(key, index + 1);
		merged.push(occurrence(entry, index));
	}
	for (const entry of snapshot) {
		const key = contentKey(entry);
		const index = snapshotCounts.get(key) ?? 0;
		snapshotCounts.set(key, index + 1);
		if (index >= (liveCounts.get(key) ?? 0)) { merged.push(occurrence(entry, index)); }
	}
	merged.sort((a, b) => (a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0));
	return limit > 0 && merged.length > limit ? merged.slice(0, limit) : merged;
}
