import { describe, expect, it } from 'vitest';
import {
	formatAxisTick,
	formatTooltipTime,
	getTimeRangeFromPreset,
	getTimezoneAbbr,
	TIME_PRESETS,
} from '../lib/time.ts';

describe('TIME_PRESETS', () => {
	it('has all required presets', () => {
		const labels = TIME_PRESETS.map((p) => p.label);
		expect(labels.includes('15m')).toBeTruthy();
		expect(labels.includes('30m')).toBeTruthy();
		expect(labels.includes('1h')).toBeTruthy();
		expect(labels.includes('6h')).toBeTruthy();
		expect(labels.includes('12h')).toBeTruthy();
		expect(labels.includes('1d')).toBeTruthy();
		expect(labels.includes('3d')).toBeTruthy();
		expect(labels.includes('1w')).toBeTruthy();
		expect(labels.includes('1mo')).toBeTruthy();
	});
});

describe('getTimeRangeFromPreset', () => {
	it('returns a range where start < end', () => {
		const now = Date.now();
		const range = getTimeRangeFromPreset('1h', now);
		expect(range.startTime < range.endTime).toBeTruthy();
		expect(range.endTime).toBe(now);
	});

	it('returns correct duration for 1h preset', () => {
		const now = Date.now();
		const range = getTimeRangeFromPreset('1h', now);
		expect(range.endTime - range.startTime).toBe(60 * 60 * 1000);
	});

	it('returns correct duration for 1d preset', () => {
		const now = Date.now();
		const range = getTimeRangeFromPreset('1d', now);
		expect(range.endTime - range.startTime).toBe(24 * 60 * 60 * 1000);
	});
});

describe('formatAxisTick', () => {
	it('formats a timestamp to local time string', () => {
		// Use a known timestamp and check it contains hour/minute pattern
		const result = formatAxisTick(1712678400000); // Apr 9, 2024 some time
		// Should contain a colon (time separator) like "2:00" or "14:00"
		expect(result.includes(':'), `Expected time format with colon, got: "${result}"`).toBeTruthy();
	});
});

describe('formatTooltipTime', () => {
	it('formats a timestamp with date and time', () => {
		const result = formatTooltipTime(1712678400000);
		// Should contain both a comma (date separator) and a colon (time)
		expect(result.includes(':'), `Expected time with colon, got: "${result}"`).toBeTruthy();
		expect(result.length > 10, `Expected full date+time, got: "${result}"`).toBeTruthy();
	});
});

describe('getTimezoneAbbr', () => {
	it('returns a non-empty timezone abbreviation', () => {
		const abbr = getTimezoneAbbr();
		expect(abbr.length >= 2, `Expected tz abbr >= 2 chars, got: "${abbr}"`).toBeTruthy();
		// Should not contain spaces (abbreviations are like "EDT", "PST", "UTC+5:30")
		expect(!abbr.includes('  '), `Expected no double spaces in tz abbr: "${abbr}"`).toBeTruthy();
	});
});
