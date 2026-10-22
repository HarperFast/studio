import { describe, expect, it } from 'vitest';
import { formatRelative, maskTokenId } from './StaffApiTokenTable';

const now = Date.parse('2026-10-22T12:00:00Z');
const at = (ms: number) => new Date(now + ms).toISOString();

describe('formatRelative', () => {
	it('picks days past two days, hours past one, minutes below', () => {
		expect(formatRelative(at(13 * 24 * 3600_000), now)).toBe('in 13 days');
		expect(formatRelative(at(-3 * 3600_000), now)).toBe('3 hours ago');
		expect(formatRelative(at(5 * 60_000), now)).toBe('in 5 minutes');
	});

	it('never shows seconds or a bare zero', () => {
		expect(formatRelative(at(10_000), now)).toBe('this minute');
		expect(formatRelative(at(-20_000), now)).toBe('this minute');
	});
});

describe('maskTokenId', () => {
	it('keeps the prefix and the tail, and leaves a short id alone', () => {
		expect(maskTokenId('sat-amxihhzaylk5mtrf')).toBe('sat-amxi…mtrf');
		expect(maskTokenId('sat-short')).toBe('sat-short');
	});
});
