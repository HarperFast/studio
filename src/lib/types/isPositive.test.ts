import { describe, expect, expectTypeOf, it } from 'vitest';
import { isPositive } from './isPositive';

describe('isPositive', () => {
	it('returns false for undefined', () => {
		const value: number | undefined = undefined;
		expect(isPositive(value)).toBe(false);
	});

	it('returns false for 0', () => {
		expect(isPositive(0)).toBe(false);
	});

	it('returns false for negative numbers', () => {
		expect(isPositive(-1)).toBe(false);
		expect(isPositive(-0.0001)).toBe(false);
	});

	it('returns true for positive integers', () => {
		expect(isPositive(1)).toBe(true);
		expect(isPositive(42)).toBe(true);
	});

	it('returns true for positive floats', () => {
		expect(isPositive(0.1)).toBe(true);
		expect(isPositive(Math.PI)).toBe(true);
	});

	it('returns true for very small positive epsilon', () => {
		expect(isPositive(Number.EPSILON)).toBe(true);
	});

	it('handles special numeric values as expected', () => {
		expect(isPositive(NaN)).toBe(false);
		expect(isPositive(Infinity)).toBe(true);
	});

	it('acts as a type guard to narrow number | undefined to number', () => {
		const maybe: number | undefined = Math.random() > 0.5 ? 5 : undefined;

		if (isPositive(maybe)) {
			// Inside this branch, `maybe` should be narrowed to `number`.
			expectTypeOf(maybe).toEqualTypeOf<number>();
			// At runtime we can also use it as a number safely.
			expect(maybe > 0).toBe(true);
		} else {
			// Here, `maybe` is `number | undefined`, but not a positive number.
			expect(maybe === undefined || maybe <= 0).toBe(true);
		}
	});
});
