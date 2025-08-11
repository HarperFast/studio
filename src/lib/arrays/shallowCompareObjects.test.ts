import { describe, expect, it } from 'vitest';
import { shallowCompareObjects } from './shallowCompareObjects';

describe('shallowCompareObjects', () => {
	it('should return true for identical objects', () => {
		const obj1 = { a: 1, b: 2, c: 3 };
		const obj2 = { a: 1, b: 2, c: 3 };
		expect(shallowCompareObjects(obj1, obj2)).toBe(true);
	});

	it('should return true when comparing an object to itself', () => {
		const obj = { a: 1, b: 2, c: 3 };
		expect(shallowCompareObjects(obj, obj)).toBe(true);
	});

	it('should return false for objects with different key counts', () => {
		const obj1 = { a: 1, b: 2, c: 3 };
		const obj2 = { a: 1, b: 2 };
		expect(shallowCompareObjects(obj1, obj2)).toBe(false);
	});

	it('should return false for objects with same keys but different values', () => {
		const obj1 = { a: 1, b: 2, c: 3 };
		const obj2 = { a: 1, b: 2, c: 4 };
		expect(shallowCompareObjects(obj1, obj2)).toBe(false);
	});

	it('should return false for objects with different keys', () => {
		const obj1 = { a: 1, b: 2, c: 3 };
		const obj2 = { a: 1, b: 2, d: 3 };
		expect(shallowCompareObjects(obj1, obj2)).toBe(false);
	});

	it('should handle objects with nested objects (shallow comparison only)', () => {
		const nestedObj1 = { x: 1 };
		const nestedObj2 = { x: 1 };

		// Same nested object reference - should be true
		const obj1 = { a: 1, b: nestedObj1 };
		const obj2 = { a: 1, b: nestedObj1 };
		expect(shallowCompareObjects(obj1, obj2)).toBe(true);

		// Different nested object references with same content - should be false
		const obj3 = { a: 1, b: nestedObj1 };
		const obj4 = { a: 1, b: nestedObj2 };
		expect(shallowCompareObjects(obj3, obj4)).toBe(false);
	});

	it('should handle arrays as values (shallow comparison)', () => {
		const arr1 = [1, 2, 3];

		// Same array reference - should be true
		const obj1 = { a: 1, b: arr1 };
		const obj2 = { a: 1, b: arr1 };
		expect(shallowCompareObjects(obj1, obj2)).toBe(true);

		// Different array references with same content - should be false
		const obj3 = { a: 1, b: arr1 };
		const obj4 = { a: 1, b: [1, 2, 3] };
		expect(shallowCompareObjects(obj3, obj4)).toBe(false);
	});

	it('should handle edge cases', () => {
		// Both null
		expect(shallowCompareObjects(null, null)).toBe(true);

		// One null, one object
		expect(shallowCompareObjects(null, {})).toBe(false);
		expect(shallowCompareObjects({}, null)).toBe(false);

		// Both undefined
		expect(shallowCompareObjects(undefined, undefined)).toBe(true);

		// One undefined, one object
		expect(shallowCompareObjects(undefined, {})).toBe(false);
		expect(shallowCompareObjects({}, undefined)).toBe(false);

		// Empty objects
		expect(shallowCompareObjects({}, {})).toBe(true);
	});

	it('should handle objects with functions as values', () => {
		const func1 = () => console.log('test');

		// Same function reference - should be true
		const obj1 = { a: 1, b: func1 };
		const obj2 = { a: 1, b: func1 };
		expect(shallowCompareObjects(obj1, obj2)).toBe(true);

		// Different function references - should be false
		const obj3 = { a: 1, b: func1 };
		const obj4 = { a: 1, b: () => console.log('test') };
		expect(shallowCompareObjects(obj3, obj4)).toBe(false);
	});
});
