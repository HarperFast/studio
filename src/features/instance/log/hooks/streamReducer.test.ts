import { ReadLogItem } from '@/integrations/api/instance/status/getReadLog';
import { describe, expect, it } from 'vitest';
import { INITIAL_STREAM_STATE, streamReducer } from './streamReducer';

function entry(message: string, timestamp: string): ReadLogItem {
	return { level: 'info', timestamp, thread: 'main/0', tags: [], node: '', message };
}

describe('streamReducer', () => {
	it('append accumulates entries under the cap', () => {
		const a = entry('a', '2026-07-08T00:00:01.000Z');
		const b = entry('b', '2026-07-08T00:00:02.000Z');
		const state = streamReducer(INITIAL_STREAM_STATE, { kind: 'append', entries: [a, b], cap: 10 });
		expect(state.entries).toEqual([a, b]);
	});

	it('append evicts the oldest by timestamp when over the cap', () => {
		const old = entry('old', '2026-07-08T00:00:01.000Z');
		const mid = entry('mid', '2026-07-08T00:00:02.000Z');
		const recent = entry('recent', '2026-07-08T00:00:03.000Z');
		const state = streamReducer(INITIAL_STREAM_STATE, { kind: 'append', entries: [old, mid, recent], cap: 2 });
		expect(state.entries.map((e) => e.message)).toEqual(['recent', 'mid']);
	});

	it('retry clears the fall-back flag but keeps the streamed entries (Live re-enable)', () => {
		const a = entry('a', '2026-07-08T00:00:01.000Z');
		const fellBack = { entries: [a], fellBack: true };
		const state = streamReducer(fellBack, { kind: 'retry' });
		expect(state.fellBack).toBe(false);
		expect(state.entries).toEqual([a]); // not discarded
	});

	it('retry is a no-op when not fallen back', () => {
		const a = entry('a', '2026-07-08T00:00:01.000Z');
		const base = { entries: [a], fellBack: false };
		expect(streamReducer(base, { kind: 'retry' })).toBe(base);
	});

	it('reset clears entries and the fall-back flag (new filter/entity context)', () => {
		const a = entry('a', '2026-07-08T00:00:01.000Z');
		const state = streamReducer({ entries: [a], fellBack: true }, { kind: 'reset' });
		expect(state).toEqual({ entries: [], fellBack: false });
	});
});
