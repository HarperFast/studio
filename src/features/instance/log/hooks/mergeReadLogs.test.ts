import { ReadLogItem } from '@/integrations/api/instance/status/getReadLog';
import { describe, expect, it } from 'vitest';
import { mergeReadLogs } from './mergeReadLogs';

function entry(message: string, timestamp: string, overrides: Partial<ReadLogItem> = {}): ReadLogItem {
	return { level: 'info', timestamp, thread: 'main/0', tags: [], node: '', message, ...overrides };
}

describe('mergeReadLogs', () => {
	it('places live entries ahead of the snapshot, newest-first', () => {
		const snapshot = [entry('older', '2026-07-07T00:00:01.000Z')];
		const live = [entry('newer', '2026-07-07T00:00:05.000Z')];

		expect(mergeReadLogs(snapshot, live, 100).map((e) => e.message)).toEqual(['newer', 'older']);
	});

	it('de-duplicates lines present in both sources', () => {
		const shared = entry('shared', '2026-07-07T00:00:02.000Z');
		const merged = mergeReadLogs([shared, entry('old', '2026-07-07T00:00:01.000Z')], [shared], 100);

		expect(merged.map((e) => e.message)).toEqual(['shared', 'old']);
	});

	it('sorts defensively by timestamp regardless of input order', () => {
		const live = [
			entry('b', '2026-07-07T00:00:02.000Z'),
			entry('d', '2026-07-07T00:00:04.000Z'),
		];
		const snapshot = [
			entry('a', '2026-07-07T00:00:01.000Z'),
			entry('c', '2026-07-07T00:00:03.000Z'),
		];

		expect(mergeReadLogs(snapshot, live, 100).map((e) => e.message)).toEqual(['d', 'c', 'b', 'a']);
	});

	it('caps the merged list at the limit', () => {
		const live = Array.from({ length: 5 }, (_, i) => entry(`e${i}`, `2026-07-07T00:00:1${i}.000Z`));
		expect(mergeReadLogs([], live, 3)).toHaveLength(3);
	});

	it('treats entries with the same timestamp but different messages as distinct', () => {
		const ts = '2026-07-07T00:00:02.000Z';
		const merged = mergeReadLogs([], [entry('one', ts), entry('two', ts)], 100);
		expect(merged).toHaveLength(2);
	});

	it('keeps lines distinct across nodes even when otherwise identical', () => {
		const ts = '2026-07-07T00:00:02.000Z';
		const merged = mergeReadLogs(
			[],
			[entry('same', ts, { node: 'node-a' }), entry('same', ts, { node: 'node-b' })],
			100,
		);
		expect(merged).toHaveLength(2);
	});
});
