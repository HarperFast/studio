import { describe, expect, it } from 'vitest';

import { itemKeyIsDefined } from './itemKeyIsDefined';

describe('itemKeyIsDefined', () => {
	it('returns true when property exists even if the value is falsy or null', () => {
		const item = { count: 0, active: false, label: '', data: null as null | string };

		expect(itemKeyIsDefined(item, 'count')).toBe(true);
		expect(itemKeyIsDefined(item, 'active')).toBe(true);
		expect(itemKeyIsDefined(item, 'label')).toBe(true);
		expect(itemKeyIsDefined(item, 'data')).toBe(true);
	});

	it('returns false when property value is undefined', () => {
		const item: { id: number; missing?: string } = { id: 1 };

		expect(itemKeyIsDefined(item, 'missing')).toBe(false);
	});
});
