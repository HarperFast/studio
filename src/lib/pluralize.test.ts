import { describe, it, expect } from 'vitest';
import { pluralize } from '@/lib/pluralize';

describe('pluralize', () => {
	it('returns singular when value is exactly number 1', () => {
		expect(pluralize(1, 'item', 'items')).toBe('1 item');
		// also test 1.0 which is strictly equal to 1 in JS number semantics
		expect(pluralize(1.0, 'file', 'files')).toBe('1 file');
	});

	it('returns singular when value is string "1" (not strictly equal to 1)', () => {
		expect(pluralize('1', 'item', 'items')).toBe('1 item');
	});

	it('returns plural for numbers other than 1', () => {
		expect(pluralize(0, 'cat', 'cats')).toBe('0 cats');
		expect(pluralize(2, 'cat', 'cats')).toBe('2 cats');
		expect(pluralize(-1, 'cat', 'cats')).toBe('-1 cats');
		expect(pluralize(3.5, 'point', 'points')).toBe('3.5 points');
	});

	it('returns plural for string numbers other than "1"', () => {
		expect(pluralize('2', 'apple', 'apples')).toBe('2 apples');
		expect(pluralize('0', 'apple', 'apples')).toBe('0 apples');
		expect(pluralize('?', 'apple', 'apples')).toBe('? apples');
	});

	it('returns plural for NaN since it is not strictly equal to 1', () => {
		expect(pluralize(Number.NaN, 'byte', 'bytes')).toBe('NaN bytes');
	});
});
