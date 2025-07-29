import { sortByName } from '@/lib/arrays/sort/byName';
import { describe, expect, it } from 'vitest';

describe('sortByName', () => {
	it('should sort objects by name in ascending order', () => {
		const items = [
			{ name: 'John' },
			{ name: 'Alice' },
			{ name: 'Zack' },
			{ name: 'Bob' },
		];

		items.sort(sortByName);

		expect(items.map(item => item.name)).toEqual([
			'Alice',
			'Bob',
			'John',
			'Zack',
		]);
	});

	it('should handle case sensitivity correctly', () => {
		const items = [
			{ name: 'john' },
			{ name: 'Alice' },
			{ name: 'bob' },
		];

		items.sort(sortByName);

		// Capital letters come before lowercase in standard string comparison
		expect(items.map(item => item.name)).toEqual([
			'Alice',
			'bob',
			'john',
		]);
	});

	it('should handle names with spaces and special characters', () => {
		const items = [
			{ name: 'John Doe' },
			{ name: 'Jane Smith' },
			{ name: 'John-Paul Jones' },
			{ name: 'Jane O\'Connor' },
		];

		items.sort(sortByName);

		expect(items.map(item => item.name)).toEqual([
			'Jane O\'Connor',
			'Jane Smith',
			'John Doe',
			'John-Paul Jones',
		]);
	});

	it('should handle empty name strings', () => {
		const items = [
			{ name: 'John' },
			{ name: '' },
			{ name: 'Alice' },
		];

		items.sort(sortByName);

		expect(items.map(item => item.name)).toEqual([
			'',
			'Alice',
			'John',
		]);
	});

	it('should handle numeric names', () => {
		const items = [
			{ name: '10' },
			{ name: '2' },
			{ name: '1' },
		];

		items.sort(sortByName);

		// String comparison, not numeric
		expect(items.map(item => item.name)).toEqual([
			'1',
			'10',
			'2',
		]);
	});
});
