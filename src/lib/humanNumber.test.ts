import { describe, expect, it } from 'vitest';
import { humanNumber } from './humanNumber';

describe('humanNumber', () => {
	it('should return rounded number for values less than 1000', () => {
		expect(humanNumber(0)).toBe(0);
		expect(humanNumber(500)).toBe(500);
		expect(humanNumber(999)).toBe(999);
		expect(humanNumber(999.9)).toBe(1000); // Tests rounding behavior
	});

	it('should convert to K for values between 1000 and 999,999', () => {
		expect(humanNumber(1000)).toBe('1 K');
		expect(humanNumber(1500)).toBe('2 K'); // Tests rounding
		expect(humanNumber(9999)).toBe('10 K');
		expect(humanNumber(10000)).toBe('10 K');
		expect(humanNumber(999000)).toBe('999 K');
		// Note: 999,999 actually converts to "1 M" in the current implementation
	});

	it('should convert to M for values between 1,000,000 and 999,999,999', () => {
		expect(humanNumber(1000000)).toBe('1 M');
		expect(humanNumber(1500000)).toBe('2 M'); // Tests rounding
		expect(humanNumber(10000000)).toBe('10 M');
		expect(humanNumber(999000000)).toBe('999 M');
		// Note: 999,999,999 actually converts to "1 B" in the current implementation
	});

	it('should convert to B for values between 1,000,000,000 and 999,999,999,999', () => {
		expect(humanNumber(1000000000)).toBe('1 B');
		expect(humanNumber(1500000000)).toBe('2 B'); // Tests rounding
		expect(humanNumber(10000000000)).toBe('10 B');
		expect(humanNumber(999000000000)).toBe('999 B');
		// Note: 999,999,999,999 actually converts to "1 T" in the current implementation
	});

	it('should convert to T for values between 1,000,000,000,000 and 999,999,999,999,999', () => {
		expect(humanNumber(1000000000000)).toBe('1 T');
		expect(humanNumber(1500000000000)).toBe('2 T'); // Tests rounding
		expect(humanNumber(10000000000000)).toBe('10 T');
	});

	it('should handle higher units correctly', () => {
		// Qa (Quadrillion)
		expect(humanNumber(1000000000000000)).toBe('1 Qa');
		// Qi (Quintillion)
		expect(humanNumber(1000000000000000000)).toBe('1 Qi');
	});

	it('should handle negative numbers correctly', () => {
		expect(humanNumber(-500)).toBe(-500);
		expect(humanNumber(-1000)).toBe('-1 K');
		expect(humanNumber(-1000000)).toBe('-1 M');
		expect(humanNumber(-1000000000)).toBe('-1 B');
	});

	it('should handle decimal values correctly', () => {
		expect(humanNumber(1234.56)).toBe('1 K');
		expect(humanNumber(1234567.89)).toBe('1 M');
	});

	it('should use the highest available unit for extremely large numbers', () => {
		// Create a number larger than the highest defined unit (11 units in the array)
		const extremelyLargeNumber = Math.pow(1000, 12); // Beyond the last unit (Dc)
		// Should use the last unit in the array (Dc)
		const result = humanNumber(extremelyLargeNumber);
		expect(result.endsWith(' Dc')).toBe(true);
	});
});
