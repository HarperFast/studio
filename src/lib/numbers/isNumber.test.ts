import { describe, expect, it } from 'vitest';
import { isNumber } from './isNumber';

// This unit test suite documents the current behavior of isNumber,
// which relies on JavaScript's numeric coercion and parseFloat.
// It intentionally accepts several JavaScript-recognized numeric forms
// (including exponents, Infinity, and numeric prefixes like 0x) and
// rejects clearly non-numeric strings or incomplete numbers.

describe('isNumber', () => {
	it('returns true for plain integers', () => {
		expect(isNumber('0')).toBe(true);
		expect(isNumber('5')).toBe(true);
		expect(isNumber('12')).toBe(true);
		expect(isNumber('-7')).toBe(true);
		expect(isNumber('+3')).toBe(true);
	});

	it('returns true for decimals and leading-dot decimals', () => {
		expect(isNumber('0.5')).toBe(true);
		expect(isNumber('.5')).toBe(true);
		expect(isNumber('123.456')).toBe(true);
		expect(isNumber('-.5')).toBe(true);
	});

	it('returns true for scientific notation (exponents)', () => {
		expect(isNumber('1e3')).toBe(true);
		expect(isNumber('2E6')).toBe(true);
		expect(isNumber('-1e-3')).toBe(true);
		expect(isNumber('+1E+2')).toBe(true);
	});

	it('returns true for special numeric strings and prefixes recognized by JS Number', () => {
		// Infinity forms are considered numbers by JS Number()
		expect(isNumber('Infinity')).toBe(true);
		expect(isNumber('-Infinity')).toBe(true);

		// Hex/Binary/Octal prefixes are parsed by Number(); parseFloat reads leading 0
		expect(isNumber('0x11')).toBe(true); // 17
		expect(isNumber('0b10')).toBe(true); // 2
		expect(isNumber('0o10')).toBe(true); // 8
	});

	it('ignores surrounding whitespace for valid numbers', () => {
		expect(isNumber(' 1 ')).toBe(true);
		expect(isNumber('\n-2\t')).toBe(true);
	});

	it('returns false for empty or whitespace-only strings', () => {
		expect(isNumber('')).toBe(false);
		expect(isNumber(' ')).toBe(false);
		expect(isNumber('\t\n')).toBe(false);
	});

	it('returns false for non-numeric and malformed strings', () => {
		expect(isNumber('abc')).toBe(false);
		expect(isNumber('123abc')).toBe(false);
		expect(isNumber('abc123')).toBe(false);
		expect(isNumber('--1')).toBe(false);
		expect(isNumber('1..2')).toBe(false);
		expect(isNumber('.')).toBe(false);
		expect(isNumber('-')).toBe(false);
		expect(isNumber('+')).toBe(false);
		expect(isNumber('NaN')).toBe(false);
	});

	it('returns a boolean type', () => {
		const out = isNumber('42');
		expect(typeof out).toBe('boolean');
	});
});
