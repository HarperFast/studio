import { describe, expect, it } from 'vitest';
import { getLogDateError, getLogDateMax, LOG_DATE_MIN, LogFiltersFormSchema } from './logFiltersFormSchema';

// Every fixture is local time (or, for the epoch, at least 14h clear of it), so these hold in any zone.
const NOW = new Date(2026, 9, 10, 14, 30, 0);
const INVALID = 'Enter a valid date and time with a 4-digit year';

describe('LOG_DATE_MIN', () => {
	it('is the Unix epoch, written in local time', () => {
		expect(LOG_DATE_MIN).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
		expect(Date.parse(LOG_DATE_MIN)).toBe(0);
	});
});

describe('getLogDateMax', () => {
	it('is the last second of the local day, in datetime-local form', () => {
		expect(getLogDateMax(NOW)).toBe('2026-10-10T23:59:59');
		expect(getLogDateMax(new Date(2026, 0, 5, 0, 0, 1))).toBe('2026-01-05T23:59:59');
	});
});

describe('getLogDateError', () => {
	it('accepts a blank value as "no bound"', () => {
		expect(getLogDateError('', NOW)).toBeUndefined();
		expect(getLogDateError(undefined, NOW)).toBeUndefined();
		expect(getLogDateError(null, NOW)).toBeUndefined();
	});

	it('accepts minute- and second-precision values within the bounds, bounds included', () => {
		expect(getLogDateError('2026-10-01T09:15', NOW)).toBeUndefined();
		expect(getLogDateError('2026-10-01T09:15:42', NOW)).toBeUndefined();
		expect(getLogDateError(LOG_DATE_MIN, NOW)).toBeUndefined();
		expect(getLogDateError(getLogDateMax(NOW), NOW)).toBeUndefined();
	});

	it('accepts a later time today, since a future `until` just means "up to now"', () => {
		expect(getLogDateError('2026-10-10T22:00', NOW)).toBeUndefined();
	});

	it('rejects the 5- and 6-digit years the native input lets a user type', () => {
		expect(getLogDateError('40999-01-01T00:00', NOW)).toBe(INVALID);
		expect(getLogDateError('202555-01-01T10:30:45', NOW)).toBe(INVALID);
	});

	it('rejects values that are not a datetime-local value at all', () => {
		expect(getLogDateError('yesterday', NOW)).toBe(INVALID);
		expect(getLogDateError('2026-10-01', NOW)).toBe(INVALID);
	});

	it('rejects instants before the epoch and days after today', () => {
		expect(getLogDateError('1969-12-30T23:59:59', NOW)).toBe('Date cannot be before 1970 (UTC)');
		expect(getLogDateError('1970-01-02T00:00', NOW)).toBeUndefined();
		expect(getLogDateError('2026-10-11T00:00', NOW)).toBe('Date cannot be after today');
		expect(getLogDateError('2030-01-01T00:00', NOW)).toBe('Date cannot be after today');
	});
});

describe('LogFiltersFormSchema', () => {
	it('rejects a 6-digit year on either bound, reporting it on that field', () => {
		const result = LogFiltersFormSchema.safeParse({ from: '202555-01-01T10:30', until: '209999-01-01T10:30' });
		expect(result.success).toBe(false);
		expect(result.error?.issues.map((issue) => issue.path)).toEqual([['from'], ['until']]);
	});

	it('still accepts the blank defaults the page starts with', () => {
		expect(LogFiltersFormSchema.safeParse({ from: '', until: '', limit: '100', level: 'undefined' }).success)
			.toBe(true);
	});
});
