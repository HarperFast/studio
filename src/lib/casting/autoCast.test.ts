import { describe, expect, it } from 'vitest';
import { autoCast } from './autoCast';

// This suite verifies the current behavior of autoCast:
// - Passthrough for null/undefined/empty string and any non-string inputs
// - Common string mappings (true/false/null/undefined/NaN with specific casing)
// - Numeric casting via autoCasterIsNumberCheck rules
// - ISO 8601 datetime recognition with timezone into Date objects
// - Everything else remains the original string

describe('autoCast', () => {
	describe('passthrough values', () => {
		it('returns null, undefined, and empty string unchanged', () => {
			expect(autoCast(null)).toBeNull();
			expect(autoCast(undefined)).toBeUndefined();
			expect(autoCast('')).toBe('');
		});

		it('returns non-string inputs unchanged (by identity when applicable)', () => {
			const num = 42;
			expect(autoCast(num)).toBe(num);

			const bool = true;
			expect(autoCast(bool)).toBe(bool);

			const obj = { a: 1 } as const;
			expect(autoCast(obj)).toBe(obj);

			const arr = [1, 2, 3] as const;
			expect(autoCast(arr)).toBe(arr);

			const d = new Date('2020-01-01T00:00:00.000Z');
			expect(autoCast(d)).toBe(d);
		});
	});

	describe('common string mappings', () => {
		it('maps selected tokens to booleans/null/NaN', () => {
			expect(autoCast('true')).toBe(true);
			expect(autoCast('TRUE')).toBe(true);
			expect(autoCast('false')).toBe(false);
			expect(autoCast('FALSE')).toBe(false);

			// string "undefined" maps to null (not undefined)
			expect(autoCast('undefined')).toBeNull();

			// various null casings handled as configured
			expect(autoCast('null')).toBeNull();
			expect(autoCast('NULL')).toBeNull();

			const nanResult = autoCast('NaN');
			expect(typeof nanResult).toBe('number');
			expect(Number.isNaN(nanResult as number)).toBe(true);
		});

		it('does not map non-configured variants', () => {
			// Not configured in the table: remains a string
			expect(autoCast('True')).toBe('True');
			expect(autoCast('False')).toBe('False');
			expect(autoCast('UNDEFINED')).toBe('UNDEFINED');
			expect(autoCast('nan')).toBe('nan');
		});
	});

	describe('numeric casting via autoCasterIsNumberCheck', () => {
		it('casts common numeric strings to numbers', () => {
			expect(autoCast('0')).toBe(0);
			expect(autoCast('5')).toBe(5);
			expect(autoCast(' 1 ')).toBe(1);
			expect(autoCast('0.5')).toBe(0.5);
			expect(autoCast('.5')).toBe(0.5);
			expect(autoCast('-.5')).toBe(-0.5);
		});

		it('produces Infinity for the string "Infinity"', () => {
			expect(autoCast('Infinity')).toBe(Infinity);
			expect(autoCast('-Infinity')).toBe(-Infinity);
		});

		it('rejects certain numeric-like forms and returns the original string', () => {
			// leading-zero integers are rejected
			expect(autoCast('0123')).toBe('0123');
			expect(autoCast('00')).toBe('00');

			// scientific notation rejected
			expect(autoCast('1e3')).toBe('1e3');
			expect(autoCast('2E6')).toBe('2E6');

			// numeric prefixes rejected
			expect(autoCast('0x10')).toBe('0x10');
			expect(autoCast('0b10')).toBe('0b10');
			expect(autoCast('0o10')).toBe('0o10');
		});
	});

	describe('ISO datetime casting', () => {
		it('casts ISO date-time strings with timezone to Date', () => {
			const d1 = autoCast('2020-01-01T12:30Z');
			expect(d1).toBeInstanceOf(Date);
			expect((d1 as Date).toISOString()).toBe('2020-01-01T12:30:00.000Z');

			const d2 = autoCast('2020-01-01T12:30:45Z');
			expect(d2).toBeInstanceOf(Date);
			expect((d2 as Date).toISOString()).toBe('2020-01-01T12:30:45.000Z');

			const d3 = autoCast('2020-01-01T12:30:45.123Z');
			expect(d3).toBeInstanceOf(Date);
			expect((d3 as Date).toISOString()).toBe('2020-01-01T12:30:45.123Z');

			const d4 = autoCast('2020-01-01T12:30+02:00');
			expect(d4).toBeInstanceOf(Date);
			expect((d4 as Date).toISOString()).toBe('2020-01-01T10:30:00.000Z');
		});

		it('does not cast non-ISO or timezone-less date strings', () => {
			expect(autoCast('2020-01-01')).toBe('2020-01-01');
			expect(autoCast('2020-01-01T12:30')).toBe('2020-01-01T12:30');
			expect(autoCast('2020-01-01 12:30Z')).toBe('2020-01-01 12:30Z');
		});
	});

	it('returns a value with the expected runtime type', () => {
		const a = autoCast('true');
		expect(typeof a).toBe('boolean');

		const b = autoCast('42');
		expect(typeof b).toBe('number');

		const c = autoCast('2020-01-01T00:00Z');
		expect(c instanceof Date).toBe(true);

		const d = autoCast('not-a-special-value');
		expect(typeof d).toBe('string');
	});
});
