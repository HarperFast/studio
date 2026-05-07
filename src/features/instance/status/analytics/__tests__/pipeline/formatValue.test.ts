import { describe, expect, it } from 'vitest';
import { formatValue } from '../../primitives/formatValue.ts';

describe('formatValue count-si', () => {
	it('renders single-digit values without suffix', () => {
		expect(formatValue(1, 'count-si')).toBe('1');
		expect(formatValue(50, 'count-si')).toBe('50');
	});
	it('renders thousands with k suffix and one decimal', () => {
		expect(formatValue(1_500, 'count-si')).toBe('1.5k');
		expect(formatValue(50_000, 'count-si')).toBe('50k');
	});
	it('renders millions with M suffix', () => {
		expect(formatValue(1_200_000, 'count-si')).toBe('1.2M');
	});
	it('renders billions with B suffix', () => {
		expect(formatValue(5_000_000_000, 'count-si')).toBe('5B');
	});
	it('handles zero', () => {
		expect(formatValue(0, 'count-si')).toBe('0');
	});
	it('handles negative values with sign + suffix', () => {
		expect(formatValue(-1500, 'count-si')).toBe('-1.5k');
	});
	it('renders sub-thousand floats verbatim (1.5 → "1.5")', () => {
		expect(formatValue(1.5, 'count-si')).toBe('1.5');
	});
});
