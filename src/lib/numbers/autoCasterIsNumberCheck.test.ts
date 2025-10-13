import { describe, expect, it } from 'vitest';
import { autoCasterIsNumberCheck } from './autoCasterIsNumberCheck';
import { isNumber } from './isNumber';

// This test suite documents the current behavior of autoCasterIsNumberCheck.
// It applies additional guards on top of isNumber for our autocaster rules:
// - Allows decimals like 0.x (fast path)
// - Disallows scientific notation (contains 'e' or 'E')
// - Disallows integers that start with a leading zero (except the literal '0')
// - Still relies on isNumber for the final numeric check
// The suite also verifies that for typical numeric forms, it yields the same
// result as isNumber.

describe('autoCasterIsNumberCheck', () => {
	it('matches isNumber for common integers/decimals and Infinity', () => {
		const samples = [
			'0',
			'5',
			'12',
			'-7',
			'+3',
			'0.5',
			'.5',
			'123.456',
			'-.5',
			'Infinity',
			'-Infinity',
			' 1 ',
			'\n-2\t',
		];

		for (const s of samples) {
			expect(autoCasterIsNumberCheck(s)).toBe(isNumber(s));
		}
	});

	it('accepts 0.x decimals quickly and rejects other leading-zero numbers', () => {
		// Fast-path acceptance for 0.x
		expect(autoCasterIsNumberCheck('0.1')).toBe(true);
		expect(autoCasterIsNumberCheck('0.0009')).toBe(true);

		// Leading zero integer-like strings are rejected (even though isNumber would accept)
		expect(isNumber('0123')).toBe(true);
		expect(autoCasterIsNumberCheck('0123')).toBe(false);

		// The literal '0' is allowed
		expect(autoCasterIsNumberCheck('0')).toBe(true);

		// Multiple zeros without decimal should be rejected by the guard
		expect(isNumber('00')).toBe(true);
		expect(autoCasterIsNumberCheck('00')).toBe(false);
	});

	it('rejects scientific notation even though isNumber would accept it', () => {
		const exponents = ['1e3', '2E6', '-1e-3', '+1E+2'];
		for (const s of exponents) {
			expect(isNumber(s)).toBe(true);
			expect(autoCasterIsNumberCheck(s)).toBe(false);
		}
	});

	it('rejects 0x/0b/0o prefixes that JS Number accepts', () => {
		const prefixed = ['0x11', '0b10', '0o10'];
		for (const s of prefixed) {
			expect(isNumber(s)).toBe(true);
			expect(autoCasterIsNumberCheck(s)).toBe(false);
		}
	});

	it('returns false for clearly non-numeric strings and empty/whitespace', () => {
		const nons = ['', ' ', '\t\n', 'abc', '123abc', 'abc123', '--1', '1..2', '.', '-', '+', 'NaN'];
		for (const s of nons) {
			expect(autoCasterIsNumberCheck(s)).toBe(false);
		}
	});

	it('returns a boolean type', () => {
		const out = autoCasterIsNumberCheck('42');
		expect(typeof out).toBe('boolean');
	});
});
