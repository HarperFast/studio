import { describe, expect, it } from 'vitest';
import { sortByField } from './byField';

describe('sortByField', () => {
	it('sorts objects by a string field in ascending order', () => {
		const items = [
			{ id: 3, name: 'Charlie' },
			{ id: 1, name: 'Alice' },
			{ id: 2, name: 'Bob' },
		];

		const result = items.sort(sortByField<typeof items[number]>('name'));

		expect(result.map((i) => i.name)).toEqual(['Alice', 'Bob', 'Charlie']);
	});

	it('sorts objects by a numeric field in ascending order', () => {
		const items = [
			{ label: 'c', value: 30 },
			{ label: 'a', value: 10 },
			{ label: 'b', value: 20 },
		];

		const result = items.sort(sortByField<typeof items[number]>('value'));

		expect(result.map((i) => i.value)).toEqual([10, 20, 30]);
	});

	it('comparator returns 0 when the field values are equal', () => {
		const cmp = sortByField<{ id: number }>('id');
		expect(cmp({ id: 1 }, { id: 1 })).toBe(0);
	});
});
