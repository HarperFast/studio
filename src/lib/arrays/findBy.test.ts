import { describe, expect, it } from 'vitest';

import { findBy } from './findBy';

describe('findBy', () => {
	const data = [
		{ id: 1, name: 'alpha' },
		{ id: 2, name: 'beta' },
		{ id: 3, name: 'gamma' },
	];

	it('returns the first element matching the field value', () => {
		expect(findBy(data, 'id', 2)).toEqual({ id: 2, name: 'beta' });
	});

	it('returns undefined when no element matches', () => {
		expect(findBy(data, 'id', 99)).toBeUndefined();
	});

	it('can search by string fields', () => {
		expect(findBy(data, 'name', 'gamma')).toEqual({ id: 3, name: 'gamma' });
	});
});
