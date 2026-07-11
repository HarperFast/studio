import { describe, expect, it } from 'vitest';
import { formatAxisTick, formatTooltipTime, getTimezoneAbbr } from '../lib/time.ts';

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
