import { describe, expect, it } from 'vitest';
import { toUSD } from './toUSD';

describe('toUSD', () => {
	it('should format positive integers correctly', () => {
		expect(toUSD(0)).toBe('$0.00');
		expect(toUSD(1)).toBe('$1.00');
		expect(toUSD(100)).toBe('$100.00');
		expect(toUSD(999)).toBe('$999.00');
	});

	it('should format decimal numbers correctly', () => {
		expect(toUSD(0.5)).toBe('$0.50');
		expect(toUSD(1.5)).toBe('$1.50');
		expect(toUSD(10.99)).toBe('$10.99');
		expect(toUSD(99.99)).toBe('$99.99');
		// Test rounding
		expect(toUSD(0.999)).toBe('$1.00');
		expect(toUSD(1.005)).toBe('$1.01');
	});

	it('should format negative numbers correctly', () => {
		expect(toUSD(-1)).toBe('-$1.00');
		expect(toUSD(-10.5)).toBe('-$10.50');
		expect(toUSD(-999.99)).toBe('-$999.99');
	});

	it('should format large numbers with commas as thousands separators', () => {
		expect(toUSD(1000)).toBe('$1,000.00');
		expect(toUSD(10000)).toBe('$10,000.00');
		expect(toUSD(100000)).toBe('$100,000.00');
		expect(toUSD(1000000)).toBe('$1,000,000.00');
		expect(toUSD(1000000000)).toBe('$1,000,000,000.00');
	});

	it('should handle extreme values correctly', () => {
		// Very large number
		expect(toUSD(Number.MAX_SAFE_INTEGER)).toBe('$9,007,199,254,740,991.00');

		// Very small positive number
		expect(toUSD(0.000001)).toBe('$0.00');

		// Very small negative number
		expect(toUSD(-0.000001)).toBe('-$0.00');
	});
});
