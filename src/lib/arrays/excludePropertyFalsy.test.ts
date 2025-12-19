import { describe, expect, it } from 'vitest';

import { excludePropertyFalsy } from './excludePropertyFalsy';

describe('excludePropertyFalsy', () => {
	it('filters out items where the property is undefined', () => {
		const items: Array<{ id?: number | null; name: string }> = [
			{ id: 1, name: 'first' },
			{ id: undefined, name: 'second' },
			{ name: 'third' },
			{ id: 0, name: 'fourth' },
			{ id: null, name: 'fifth' },
		];

		const result = items.filter(excludePropertyFalsy('id'));

		result.forEach(item => {
			const confirmedId: number | null = item.id;
			expect(confirmedId).not.toBeUndefined();
		});

		expect(result).toEqual([
			{ id: 1, name: 'first' },
			{ id: 0, name: 'fourth' },
			{ id: null, name: 'fifth' },
		]);
	});

	it('keeps falsy but defined values such as false', () => {
		const items: Array<{ active?: boolean; name: string }> = [
			{ active: false, name: 'inactive' },
			{ active: true, name: 'active' },
			{ name: 'unknown' },
		];

		const result = items.filter(excludePropertyFalsy('active'));

		expect(result).toEqual([
			{ active: false, name: 'inactive' },
			{ active: true, name: 'active' },
		]);
	});
});
