import { describe, expect, it } from 'vitest';
import { formatDuration } from './formatDuration';

describe('formatDuration', () => {
	it.each([
		[0, '0 ms'],
		[850, '850 ms'],
		[1_000, '1s'],
		[12_400, '12s'],
		[125_000, '2m 05s'],
		[3_725_000, '1h 02m'],
	])('formats %i ms as %s', (ms, expected) => {
		expect(formatDuration(ms)).toBe(expected);
	});

	it('shows a dash for a negative or non-finite span', () => {
		expect(formatDuration(-1)).toBe('—');
		expect(formatDuration(Number.NaN)).toBe('—');
	});
});
