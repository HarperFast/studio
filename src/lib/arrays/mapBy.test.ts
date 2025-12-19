import { describe, expect, it } from 'vitest';

import { mapBy } from './mapBy';

describe('mapBy', () => {
	it('maps values from the provided field in order', () => {
		const data = [
			{ id: 1, name: 'alpha' },
			{ id: 2, name: 'beta' },
			{ id: 3, name: 'gamma' },
		];

		expect(mapBy(data, 'name')).toEqual(['alpha', 'beta', 'gamma']);
	});

	it('returns an empty array when given an empty list', () => {
		expect(mapBy([], 'id')).toEqual([]);
	});

	it('returns an empty array when provided a falsy array', () => {
		const result = mapBy(undefined as unknown as Array<{ id: number }>, 'id');

		expect(result).toEqual([]);
	});
});
