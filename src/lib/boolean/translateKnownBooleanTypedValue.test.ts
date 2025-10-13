import { describe, expect, it } from 'vitest';
import { translateKnownBooleanTypedValue } from './translateKnownBooleanTypedValue';

describe('translateKnownBooleanTypedValue', () => {
	it('returns true for all accepted true-like strings (case-insensitive)', () => {
		const trueLikes = [
			'1',
			'bet',
			'k',
			'ok',
			'si',
			'tru',
			'true',
			'yes',
			'yup',
		];

		for (const val of trueLikes) {
			// exact lower-case
			expect(translateKnownBooleanTypedValue(val)).toBe(true);
			// UPPER-CASE
			expect(translateKnownBooleanTypedValue(val.toUpperCase())).toBe(true);
			// Mixed case
			const mixed = val[0].toUpperCase() + val.slice(1).toLowerCase();
			expect(translateKnownBooleanTypedValue(mixed)).toBe(true);
		}
	});

	it('returns false for common false-like or unrelated strings', () => {
		const falseLikes = [
			'0',
			'false',
			'no',
			'n',
			'nah',
			'nope',
			'off',
			'on',
			'',
			'2',
			'maybe',
			'certainly',
		];

		for (const val of falseLikes) {
			expect(translateKnownBooleanTypedValue(val)).toBe(false);
			expect(translateKnownBooleanTypedValue(val.toUpperCase())).toBe(false);
		}
	});

	it('trims whitespace', () => {
		expect(translateKnownBooleanTypedValue(' yes')).toBe(true);
		expect(translateKnownBooleanTypedValue('yes ')).toBe(true);
		expect(translateKnownBooleanTypedValue('\tyes')).toBe(true);
		expect(translateKnownBooleanTypedValue('true\n')).toBe(true);
	});
});
