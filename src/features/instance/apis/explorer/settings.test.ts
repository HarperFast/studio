/** @vitest-environment jsdom */
import { readEntitySettings, writeEntitySettings } from '@/features/instance/apis/explorer/settings';
import { beforeEach, describe, expect, it } from 'vitest';

const KEY = 'ApiExplorerSettings';

describe('explorer settings persistence', () => {
	beforeEach(() => localStorage.clear());

	it('round-trips one entity without touching others', () => {
		writeEntitySettings('ins-a', { auth: { type: 'bearer', token: 'A' } });
		writeEntitySettings('ins-b', { server: 'http://b' });
		expect(readEntitySettings('ins-a')).toEqual({ auth: { type: 'bearer', token: 'A' } });
		expect(readEntitySettings('ins-b')).toEqual({ server: 'http://b' });
	});

	it('a write does not resurrect an entity another tab signed out (fresh read-merge-write)', () => {
		writeEntitySettings('ins-a', { auth: { type: 'bearer', token: 'A' } });
		writeEntitySettings('ins-b', { auth: { type: 'bearer', token: 'B' } });

		// Another tab signs ins-b out: it deletes ins-b's key directly in localStorage.
		const map = JSON.parse(localStorage.getItem(KEY)!);
		delete map['ins-b'];
		localStorage.setItem(KEY, JSON.stringify(map));

		// This tab (which still had a stale full map in memory) edits ins-a.
		writeEntitySettings('ins-a', { server: 'http://a' });

		const after = JSON.parse(localStorage.getItem(KEY)!);
		expect(Object.hasOwn(after, 'ins-b')).toBe(false); // B stays signed out, not resurrected
		expect(after['ins-a']).toEqual({ auth: { type: 'bearer', token: 'A' }, server: 'http://a' });
	});

	it('reads a corrupted (non-object) stored value as empty', () => {
		localStorage.setItem(KEY, '5');
		expect(readEntitySettings('ins-a')).toEqual({});
		// And a subsequent write recovers to a valid map.
		writeEntitySettings('ins-a', { server: 'http://a' });
		expect(readEntitySettings('ins-a')).toEqual({ server: 'http://a' });
	});
});
