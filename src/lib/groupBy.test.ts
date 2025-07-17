import { describe, expect, it } from 'vitest';
import { groupBy } from './groupBy';

describe('groupBy', () => {
	it('should group items by a string property', () => {
		const items = [
			{ id: 1, category: 'fruit' },
			{ id: 2, category: 'vegetable' },
			{ id: 3, category: 'fruit' },
			{ id: 4, category: 'vegetable' },
		];

		const result = groupBy(items, 'category');

		expect(result).toEqual({
			fruit: [
				{ id: 1, category: 'fruit' },
				{ id: 3, category: 'fruit' },
			],
			vegetable: [
				{ id: 2, category: 'vegetable' },
				{ id: 4, category: 'vegetable' },
			],
		});
	});

	it('should group items by an array property', () => {
		const items = [
			{ id: 1, tags: ['red', 'sweet'] },
			{ id: 2, tags: ['green', 'crunchy'] },
			{ id: 3, tags: ['red', 'crunchy'] },
		];

		const result = groupBy(items, 'tags');

		expect(result).toEqual({
			red: [
				{ id: 1, tags: ['red', 'sweet'] },
				{ id: 3, tags: ['red', 'crunchy'] },
			],
			sweet: [
				{ id: 1, tags: ['red', 'sweet'] },
			],
			green: [
				{ id: 2, tags: ['green', 'crunchy'] },
			],
			crunchy: [
				{ id: 2, tags: ['green', 'crunchy'] },
				{ id: 3, tags: ['red', 'crunchy'] },
			],
		});
	});

	it('should handle empty arrays', () => {
		const items: { id: number; category: string }[] = [];
		const result = groupBy(items, 'category');
		expect(result).toEqual({});
	});

	it('should handle undefined or null property values', () => {
		const items = [
			{ id: 1, category: 'fruit' },
			{ id: 2, category: undefined },
			{ id: 3, category: null },
			{ id: 4, category: 'vegetable' },
		];

		const result = groupBy(items, 'category');

		expect(result).toEqual({
			fruit: [{ id: 1, category: 'fruit' }],
			undefined: [{ id: 2, category: undefined }],
			null: [{ id: 3, category: null }],
			vegetable: [{ id: 4, category: 'vegetable' }],
		});
	});

	it('should handle numeric property values', () => {
		const items = [
			{ id: 1, count: 10 },
			{ id: 2, count: 20 },
			{ id: 3, count: 10 },
		];

		const result = groupBy(items, 'count');

		expect(result).toEqual({
			'10': [
				{ id: 1, count: 10 },
				{ id: 3, count: 10 },
			],
			'20': [
				{ id: 2, count: 20 },
			],
		});
	});
});
