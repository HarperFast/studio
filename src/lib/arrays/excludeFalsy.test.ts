import { describe, expect, it } from 'vitest';

import { excludeFalsy } from './excludeFalsy';

describe('excludeFalsy', () => {
	it('filters out falsy values while preserving truthy entries', () => {
		const items = [1, 0, 'hello', '', false, true, null, undefined, { foo: 'bar' }];
		const result = items.filter(excludeFalsy);

		expect(result).toEqual([1, 'hello', true, { foo: 'bar' }]);
	});

	it('acts as a type guard when filtering arrays', () => {
		const items: Array<string | undefined> = ['a', undefined, 'b'];
		const filtered = items.filter(excludeFalsy);

		filtered.forEach(value => {
			expect(typeof value).toBe('string');
		});

		expect(filtered).toEqual(['a', 'b']);
	});
});
