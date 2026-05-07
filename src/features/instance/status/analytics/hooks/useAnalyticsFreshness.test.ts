import { describe, expect, it } from 'vitest';
import { formatRelativeUpdate } from './useAnalyticsFreshness.ts';

describe('formatRelativeUpdate', () => {
	const now = 1_700_000_000_000;

	it('returns null when no fetch has resolved yet', () => {
		expect(formatRelativeUpdate(null, now)).toBeNull();
	});

	it('reads "just now" within the first 5 seconds', () => {
		expect(formatRelativeUpdate(now, now)).toBe('just now');
		expect(formatRelativeUpdate(now - 4_000, now)).toBe('just now');
	});

	it('reads "Xs ago" between 5 and 59 seconds', () => {
		expect(formatRelativeUpdate(now - 5_000, now)).toBe('5s ago');
		expect(formatRelativeUpdate(now - 30_000, now)).toBe('30s ago');
		expect(formatRelativeUpdate(now - 59_000, now)).toBe('59s ago');
	});

	it('reads "Xm ago" between 1 and 59 minutes', () => {
		expect(formatRelativeUpdate(now - 60_000, now)).toBe('1m ago');
		expect(formatRelativeUpdate(now - 30 * 60_000, now)).toBe('30m ago');
		expect(formatRelativeUpdate(now - 59 * 60_000, now)).toBe('59m ago');
	});

	it('reads "Xh ago" past 60 minutes', () => {
		expect(formatRelativeUpdate(now - 60 * 60_000, now)).toBe('1h ago');
		expect(formatRelativeUpdate(now - 5 * 60 * 60_000, now)).toBe('5h ago');
	});

	it('clamps negative skew (lastFetchedAt > now) to "just now"', () => {
		// Clock skew or a stale `now` shouldn't render "−5s ago".
		expect(formatRelativeUpdate(now + 1_000, now)).toBe('just now');
	});
});
