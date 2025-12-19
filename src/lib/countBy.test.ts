import { describe, expect, it } from 'vitest';

import { countBy } from './countBy';

describe('countBy', () => {
	it('counts occurrences by a string property and skips undefined values', () => {
		const items = [
			{ id: 1, group: 'alpha' },
			{ id: 2, group: 'alpha' },
			{ id: 3, group: 'beta' },
			{ id: 4, group: undefined as string | undefined },
		];

		const result = countBy(items, 'group');

		expect(result).toEqual({
			alpha: 2,
			beta: 1,
		});
	});

	it('increments counts for every value in an array property', () => {
		const items = [
			{ id: 1, tags: ['red', 'sweet'] },
			{ id: 2, tags: ['sweet'] },
			{ id: 3, tags: ['red', 'bitter'] },
		];

		const result = countBy(items, 'tags');

		expect(result).toEqual({
			red: 2,
			sweet: 2,
			bitter: 1,
		});
	});

	it('coerces non-string property values to strings when counting', () => {
		const items = [
			{ id: 1, count: 1 },
			{ id: 2, count: 1 },
			{ id: 3, count: 2 },
		];

		const result = countBy(items, 'count');

		expect(result).toEqual({
			'1': 2,
			'2': 1,
		});
	});
});
