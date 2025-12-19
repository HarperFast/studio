import { describe, expect, it } from 'vitest';

import { keyBy } from './keyBy';

describe('keyBy', () => {
	it('maps items by a string property and overwrites duplicate keys with the last item', () => {
		const items = [
			{ id: 1, slug: 'alpha' },
			{ id: 2, slug: 'beta' },
			{ id: 3, slug: 'alpha' },
			{ id: 4, slug: undefined as string | undefined },
		];

		const result = keyBy(items, 'slug');

		expect(result).toEqual({
			alpha: { id: 3, slug: 'alpha' },
			beta: { id: 2, slug: 'beta' },
		});
	});

	it('handles array properties by assigning the item to each key value', () => {
		const items = [
			{ id: 1, tags: ['red', 'sweet'] },
			{ id: 2, tags: ['sweet', 'tart'] },
		];

		const result = keyBy(items, 'tags');

		expect(result).toEqual({
			red: { id: 1, tags: ['red', 'sweet'] },
			sweet: { id: 2, tags: ['sweet', 'tart'] },
			tart: { id: 2, tags: ['sweet', 'tart'] },
		});
	});

	it('supports non-string property values by coercing them to string keys', () => {
		const items = [
			{ id: 1, count: 1 },
			{ id: 2, count: 10 },
		];

		const result = keyBy(items, 'count');

		expect(result).toEqual({
			'1': { id: 1, count: 1 },
			'10': { id: 2, count: 10 },
		});
	});
});
