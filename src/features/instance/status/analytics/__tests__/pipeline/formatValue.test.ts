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

describe('formatValue bytes (shared by metric and table-size charts)', () => {
	it('keeps one decimal below 10 in the scaled unit', () => {
		expect(formatValue(1_500_000_000, 'bytes-si')).toBe('1.5 GB');
		expect(formatValue(2.5, 'bytes-si')).toBe('2.5 B');
	});
	it('rounds to integers at 10+ in the scaled unit (adaptive precision)', () => {
		expect(formatValue(512_000_000, 'bytes-si')).toBe('512 MB');
		expect(formatValue(15_000_000_000, 'bytes-si')).toBe('15 GB');
	});
	it('renders zero without a decimal', () => {
		expect(formatValue(0, 'bytes-si')).toBe('0 B');
	});
	it('uses IEC units with base 1024 for bytes-iec', () => {
		expect(formatValue(1024 * 1024, 'bytes-iec')).toBe('1.0 MiB');
		expect(formatValue(512 * 1024 * 1024, 'bytes-iec')).toBe('512 MiB');
	});
	it('composes the unit suffix after the byte unit', () => {
		expect(formatValue(1_500_000, 'bytes-si', '/s')).toBe('1.5 MB/s');
	});
});
