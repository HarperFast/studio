import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addCommasToNumbers } from './addCommasToNumbers';

// We mock Intl.NumberFormat to avoid locale-dependent output differences
// and to verify that the function calls it without custom options.

// Preserve original reference to restore after tests
const OriginalIntl = globalThis.Intl;

let lastConstructorArgs: unknown[] | null = null;

class MockNumberFormat {
	// Capture the constructor args to ensure defaults are used
	constructor(...args: unknown[]) {
		lastConstructorArgs = args;
	}

	format(n: number): string {
		// Deterministic comma insertion for thousands separators
		const sign = n < 0 ? '-' : '';
		const abs = Math.abs(n);
		const str = abs.toString();
		const [intPart, fracPart] = str.split('.');
		const intWithCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
		return sign + intWithCommas + (fracPart ? `.${fracPart}` : '');
	}
}

beforeAll(() => {
	// Replace only NumberFormat, keep the rest of Intl intact
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(globalThis as any).Intl = { ...OriginalIntl, NumberFormat: MockNumberFormat };
});

afterAll(() => {
	// Restore original Intl
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(globalThis as any).Intl = OriginalIntl;
});

describe('addCommasToNumbers', () => {
	it('uses Intl.NumberFormat with default arguments', () => {
		lastConstructorArgs = null;
		const out = addCommasToNumbers(1234);
		expect(out).toBe('1,234');
		// Default constructor should receive no arguments
		expect(lastConstructorArgs).toEqual([]);
	});

	it('formats small integers and zero', () => {
		expect(addCommasToNumbers(0)).toBe('0');
		expect(addCommasToNumbers(5)).toBe('5');
		expect(addCommasToNumbers(12)).toBe('12');
		expect(addCommasToNumbers(999)).toBe('999');
	});

	it('adds thousands separators for large integers', () => {
		expect(addCommasToNumbers(1000)).toBe('1,000');
		expect(addCommasToNumbers(1234567)).toBe('1,234,567');
		expect(addCommasToNumbers(1234567890123)).toBe('1,234,567,890,123');
	});

	it('handles negative numbers and decimals', () => {
		expect(addCommasToNumbers(-1)).toBe('-1');
		expect(addCommasToNumbers(-1234)).toBe('-1,234');
		expect(addCommasToNumbers(1234.5)).toBe('1,234.5');
		expect(addCommasToNumbers(-9876543.21)).toBe('-9,876,543.21');
	});

	it('returns a string type', () => {
		const result = addCommasToNumbers(42);
		expect(typeof result).toBe('string');
	});
});
