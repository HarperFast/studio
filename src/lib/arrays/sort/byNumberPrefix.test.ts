import { describe, expect, it } from 'vitest';
import { sortByNumberPrefix } from './byNumberPrefix';

describe('sortByNumberPrefix', () => {
	it('sorts strings by their leading numeric prefix in ascending order', () => {
		const items = [
			'1000ms, small',
			'230ms, medium',
			'50ms, large',
			'5ms, x-large',
		];

		const result = items.sort(sortByNumberPrefix);

		expect(result).toEqual([
			'5ms, x-large',
			'50ms, large',
			'230ms, medium',
			'1000ms, small',
		]);
	});

	it('returns 0 when the numeric prefixes are equal (current behavior)', () => {
		expect(sortByNumberPrefix('10 apples', '10 bananas')).toBe(0);
	});

	it('treats strings without a numeric prefix as 0', () => {
		// "apple" has no number prefix -> treated as 0; should come before positive numbers
		const items = ['apple', '2 bananas', 'banana'];
		const result = items.sort(sortByNumberPrefix);

		// "apple" and "banana" both treated as 0 and keep their relative order (sort is stable in modern engines)
		expect(result[0]).toBe('apple');
		expect(result[1]).toBe('banana');
		expect(result[2]).toBe('2 bananas');

		// direct comparator checks
		expect(sortByNumberPrefix('apple', '2 bananas')).toBe(-1);
		expect(sortByNumberPrefix('apple', 'banana')).toBe(0);
	});

	it('handles leading zeros correctly', () => {
		const items = ['007sec, tiny', '7sec, small', '0008sec, medium'];
		const result = items.sort(sortByNumberPrefix);
		expect(result).toEqual(['007sec, tiny', '7sec, small', '0008sec, medium']);
	});
});
