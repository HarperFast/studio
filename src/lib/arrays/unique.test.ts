import { describe, expect, it } from 'vitest';

import { unique } from './unique';

describe('unique', () => {
	it('returns an empty array when given an empty array', () => {
		expect(unique([])).toEqual([]);
	});

	it('returns the same array when all elements are unique', () => {
		const input = [1, 2, 3];
		expect(unique(input)).toEqual([1, 2, 3]);
	});

	it('removes duplicate numbers', () => {
		const input = [1, 2, 2, 3, 1, 4];
		expect(unique(input)).toEqual([1, 2, 3, 4]);
	});

	it('removes duplicate strings', () => {
		const input = ['a', 'b', 'a', 'c', 'b'];
		expect(unique(input)).toEqual(['a', 'b', 'c']);
	});

	it('removes duplicate booleans', () => {
		const input = [true, false, true, true, false];
		expect(unique(input)).toEqual([true, false]);
	});

	it('handles mixed primitive types', () => {
		const input = [1, '1', 1, 'a', 'a'];
		expect(unique(input)).toEqual([1, '1', 'a']);
	});

	it('keeps only unique object references', () => {
		const obj1 = { id: 1 };
		const obj2 = { id: 1 };
		const input = [obj1, obj2, obj1];

		const result = unique(input);

		expect(result).toHaveLength(2);
		expect(result[0]).toBe(obj1);
		expect(result[1]).toBe(obj2);
	});

	it('handles null and undefined', () => {
		const input = [null, undefined, null, undefined];
		expect(unique(input)).toEqual([null, undefined]);
	});
});
