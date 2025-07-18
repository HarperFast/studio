import { describe, expect, it } from 'vitest';
import { groupThenKeyBy } from './groupThenKeyBy';

describe('groupThenKeyBy', () => {
	it('should group then key items by specified properties', () => {
		const items = [
			{ id: 1, category: 'fruit', type: 'apple' },
			{ id: 2, category: 'fruit', type: 'banana' },
			{ id: 3, category: 'vegetable', type: 'carrot' },
			{ id: 4, category: 'vegetable', type: 'broccoli' },
			{ id: 5, category: 'fruit', type: 'apple' }, // Duplicate type within category
		];

		const result = groupThenKeyBy(items, 'category', 'type');

		expect(result).toEqual({
			fruit: {
				apple: { id: 5, category: 'fruit', type: 'apple' }, // Last item with same keys wins
				banana: { id: 2, category: 'fruit', type: 'banana' },
			},
			vegetable: {
				carrot: { id: 3, category: 'vegetable', type: 'carrot' },
				broccoli: { id: 4, category: 'vegetable', type: 'broccoli' },
			},
		});
	});

	it('should handle array properties for grouping', () => {
		const items = [
			{ id: 1, tags: ['red', 'sweet'], type: 'apple' },
			{ id: 2, tags: ['yellow', 'sweet'], type: 'banana' },
			{ id: 3, tags: ['orange', 'crunchy'], type: 'carrot' },
		];

		const result = groupThenKeyBy(items, 'tags', 'type');

		expect(result).toEqual({
			red: {
				apple: { id: 1, tags: ['red', 'sweet'], type: 'apple' },
			},
			sweet: {
				apple: { id: 1, tags: ['red', 'sweet'], type: 'apple' },
				banana: { id: 2, tags: ['yellow', 'sweet'], type: 'banana' },
			},
			yellow: {
				banana: { id: 2, tags: ['yellow', 'sweet'], type: 'banana' },
			},
			orange: {
				carrot: { id: 3, tags: ['orange', 'crunchy'], type: 'carrot' },
			},
			crunchy: {
				carrot: { id: 3, tags: ['orange', 'crunchy'], type: 'carrot' },
			},
		});
	});

	it('should handle array properties for keying', () => {
		const items = [
			{ id: 1, category: 'fruit', flavors: ['sweet', 'tart'] },
			{ id: 2, category: 'vegetable', flavors: ['earthy', 'bitter'] },
		];

		const result = groupThenKeyBy(items, 'category', 'flavors');

		expect(result).toEqual({
			fruit: {
				sweet: { id: 1, category: 'fruit', flavors: ['sweet', 'tart'] },
				tart: { id: 1, category: 'fruit', flavors: ['sweet', 'tart'] },
			},
			vegetable: {
				earthy: { id: 2, category: 'vegetable', flavors: ['earthy', 'bitter'] },
				bitter: { id: 2, category: 'vegetable', flavors: ['earthy', 'bitter'] },
			},
		});
	});

	it('should handle empty arrays', () => {
		const items: { id: number; category: string; type: string }[] = [];
		const result = groupThenKeyBy(items, 'category', 'type');
		expect(result).toEqual({});
	});

	it('should handle undefined or null property values for grouping', () => {
		const items = [
			{ id: 1, category: 'fruit', type: 'apple' },
			{ id: 2, category: undefined, type: 'banana' },
			{ id: 3, category: null, type: 'carrot' },
		];

		const result = groupThenKeyBy(items, 'category', 'type');

		expect(result).toEqual({
			fruit: {
				apple: { id: 1, category: 'fruit', type: 'apple' },
			},
			null: {
				carrot: { id: 3, category: null, type: 'carrot' },
			},
			// Note: undefined values are skipped, but null values are treated as keys
		});
	});

	it('should handle undefined or null property values for keying', () => {
		const items = [
			{ id: 1, category: 'fruit', type: 'apple' },
			{ id: 2, category: 'fruit', type: undefined },
			{ id: 3, category: 'vegetable', type: null },
		];

		const result = groupThenKeyBy(items, 'category', 'type');

		expect(result).toEqual({
			fruit: {
				apple: { id: 1, category: 'fruit', type: 'apple' },
				// Item with undefined type is skipped
			},
			vegetable: {
				null: { id: 3, category: 'vegetable', type: null },
			},
		});
	});

	it('should handle numeric property values', () => {
		const items = [
			{ id: 1, count: 10, size: 'small' },
			{ id: 2, count: 20, size: 'medium' },
			{ id: 3, count: 10, size: 'large' },
		];

		const result = groupThenKeyBy(items, 'count', 'size');

		expect(result).toEqual({
			'10': {
				small: { id: 1, count: 10, size: 'small' },
				large: { id: 3, count: 10, size: 'large' },
			},
			'20': {
				medium: { id: 2, count: 20, size: 'medium' },
			},
		});
	});

	it('should match the real-world usage pattern from the codebase', () => {
		// This test mimics how the function is used in the actual codebase
		const planTypes = [
			{ id: 1, deploymentDescription: 'Development', performanceDescription: 'Basic', priceUsd: 100 },
			{ id: 2, deploymentDescription: 'Development', performanceDescription: 'Advanced', priceUsd: 200 },
			{ id: 3, deploymentDescription: 'Production', performanceDescription: 'Basic', priceUsd: 300 },
			{ id: 4, deploymentDescription: 'Production', performanceDescription: 'Advanced', priceUsd: 400 },
		];

		const result = groupThenKeyBy(planTypes, 'deploymentDescription', 'performanceDescription');

		expect(result).toEqual({
			Development: {
				Basic: { id: 1, deploymentDescription: 'Development', performanceDescription: 'Basic', priceUsd: 100 },
				Advanced: {
					id: 2,
					deploymentDescription: 'Development',
					performanceDescription: 'Advanced',
					priceUsd: 200,
				},
			},
			Production: {
				Basic: { id: 3, deploymentDescription: 'Production', performanceDescription: 'Basic', priceUsd: 300 },
				Advanced: {
					id: 4,
					deploymentDescription: 'Production',
					performanceDescription: 'Advanced',
					priceUsd: 400,
				},
			},
		});

		// Verify we can access items as shown in the codebase
		expect(result['Development']['Basic']).toEqual({
			id: 1,
			deploymentDescription: 'Development',
			performanceDescription: 'Basic',
			priceUsd: 100,
		});
	});
});
