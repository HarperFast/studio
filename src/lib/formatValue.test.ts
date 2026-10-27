import { describe, expect, it } from 'vitest';
import { durationTicks, formatValue } from './formatValue';

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
	it('renders trillions with T suffix instead of thousands of B', () => {
		expect(formatValue(2_500_000_000_000, 'count-si')).toBe('2.5T');
	});
	it('handles zero', () => {
		expect(formatValue(0, 'count-si')).toBe('0');
	});
	it('handles negative values with sign + suffix', () => {
		expect(formatValue(-1500, 'count-si')).toBe('-1.5k');
	});
	it('keeps short sub-thousand floats as they are (1.5 → "1.5")', () => {
		expect(formatValue(1.5, 'count-si')).toBe('1.5');
	});
	it('rounds long sub-thousand floats to three significant figures', () => {
		expect(formatValue(1 / 60, 'count-si', '/s')).toBe('0.0167/s');
		expect(formatValue(12.3456, 'count-si')).toBe('12.3');
		expect(formatValue(456.789, 'count-si')).toBe('457');
	});
	it('never rounds a tiny non-zero rate down to "0"', () => {
		expect(formatValue(1 / 86_400, 'count-si', '/s')).toBe('0.0000116/s');
		expect(formatValue(1 / 86_400, 'count', '/s')).toBe('0.0000116/s');
	});
	it('carries a value that rounds up into the next suffix', () => {
		expect(formatValue(999.7, 'count-si')).toBe('1k');
		expect(formatValue(999_950, 'count-si')).toBe('1M');
	});
});

describe('formatValue count', () => {
	it('groups the digits of large counts', () => {
		expect(formatValue(1_234_567, 'count')).toBe('1,234,567');
	});
	it('keeps fractional precision instead of rounding to an integer', () => {
		expect(formatValue(0.35, 'count', '/s')).toBe('0.35/s');
		expect(formatValue(42, 'count')).toBe('42');
	});
});

describe('formatValue ms (durations)', () => {
	it('shows sub-millisecond values in microseconds', () => {
		expect(formatValue(0.25, 'ms')).toBe('250 µs');
		expect(formatValue(0.004, 'ms')).toBe('4 µs');
	});
	it('keeps milliseconds with adaptive precision', () => {
		expect(formatValue(0, 'ms')).toBe('0 ms');
		expect(formatValue(2.54, 'ms')).toBe('2.5 ms');
		expect(formatValue(250.4, 'ms')).toBe('250 ms');
	});
	it('scales up through seconds, minutes, hours and days', () => {
		expect(formatValue(1_500, 'ms')).toBe('1.5 s');
		expect(formatValue(45_000, 'ms')).toBe('45 s');
		expect(formatValue(150_000, 'ms')).toBe('2.5 min');
		expect(formatValue(5_400_000, 'ms')).toBe('1.5 h');
		expect(formatValue(3 * 86_400_000, 'ms')).toBe('3 d');
	});
	it('reads an epoch-sized lag in years, not trillions of ms', () => {
		expect(formatValue(Date.UTC(2026, 9, 27), 'ms')).toBe('57 yr');
	});
	it('carries a value that rounds up into the next unit', () => {
		expect(formatValue(999.96, 'ms')).toBe('1 s');
		expect(formatValue(59_990, 'ms')).toBe('1 min');
		expect(formatValue(9.96, 'ms')).toBe('10 ms');
	});
	it('never rounds a tiny non-zero duration down to "0"', () => {
		expect(formatValue(0.00004, 'ms')).toBe('0.04 µs');
	});
	it('keeps the sign of a negative (clock-skewed) latency', () => {
		expect(formatValue(-2_500, 'ms')).toBe('-2.5 s');
	});
});

describe('durationTicks', () => {
	const day = 86_400_000;
	const year = 365.25 * day;
	const labels = (max: number) => {
		const axis = durationTicks(max)!;
		return axis.ticks.map(axis.format);
	};
	it('steps by whole days instead of round millisecond counts', () => {
		expect(durationTicks(8.3 * day)?.ticks).toEqual([0, 2, 4, 6, 8, 10].map((n) => n * day));
		expect(labels(8.3 * day)).toEqual(['0 d', '2 d', '4 d', '6 d', '8 d', '10 d']);
	});
	it('steps by seconds, minutes and sub-millisecond amounts', () => {
		expect(labels(9_000)).toEqual(['0 s', '2 s', '4 s', '6 s', '8 s', '10 s']);
		expect(labels(40 * 60_000)).toEqual(['0 min', '10 min', '20 min', '30 min', '40 min']);
		expect(labels(1.4)).toEqual(['0 ms', '0.5 ms', '1 ms', '1.5 ms']);
		expect(labels(0.4)).toEqual(['0 µs', '100 µs', '200 µs', '300 µs', '400 µs']);
	});
	it('labels every tick in one unit across the day-to-year crossover', () => {
		expect(labels(365 * day)).toEqual(['0 d', '90 d', '180 d', '270 d', '360 d', '450 d']);
		expect(labels(2 * year)).toEqual(['0 yr', '0.5 yr', '1 yr', '1.5 yr', '2 yr']);
		expect(labels(Date.UTC(2026, 9, 27))).toEqual(['0 yr', '20 yr', '40 yr', '60 yr']);
	});
	it('leaves an empty or non-finite range to the chart', () => {
		expect(durationTicks(0)).toBeUndefined();
		expect(durationTicks(Number.NaN)).toBeUndefined();
	});
});

describe('formatValue percent', () => {
	it('renders one decimal', () => {
		expect(formatValue(0.453, 'percent')).toBe('45.3%');
		expect(formatValue(0, 'percent')).toBe('0.0%');
	});
	it('keeps significant digits for shares too small for one decimal', () => {
		expect(formatValue(0.00004, 'percent')).toBe('0.004%');
		expect(formatValue(0.0000006, 'percent')).toBe('0.00006%');
		expect(formatValue(-0.00004, 'percent')).toBe('-0.004%');
	});
	it('groups the digits of very large percentages', () => {
		expect(formatValue(123.456, 'percent')).toBe('12,346%');
	});
});

describe('formatValue without a formatter', () => {
	it('rounds raw floats instead of printing every digit', () => {
		expect(formatValue(0.1 + 0.2)).toBe('0.3');
		expect(formatValue(1_234_567.891)).toBe('1,234,568');
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
	it('carries a value that rounds up into the next unit', () => {
		expect(formatValue(999_999_999, 'bytes-si')).toBe('1.0 GB');
	});
	it('scales past terabytes', () => {
		expect(formatValue(2_000_000_000_000_000, 'bytes-si')).toBe('2.0 PB');
	});
	it('drops the sign when the magnitude rounds to zero', () => {
		expect(formatValue(-0.01, 'bytes-si')).toBe('0.0 B');
	});
});
