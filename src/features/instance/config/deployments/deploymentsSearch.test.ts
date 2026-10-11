import { describe, expect, it } from 'vitest';
import { filterableStatuses, validateDeploymentsSearch } from './deploymentsSearch';

describe('validateDeploymentsSearch', () => {
	it('keeps a component, a known status and a later page', () => {
		expect(validateDeploymentsSearch({ project: ' web ', status: 'staged', page: '3' }))
			.toEqual({ project: 'web', status: 'staged', page: 3 });
	});

	it.each([
		['an empty component', { project: '  ' }],
		['a status Harper does not filter on', { status: 'bogus' }],
		['the first page, which is the default', { page: 1 }],
		['a page that is not a whole number', { page: '2.5' }],
		['a negative page', { page: -2 }],
		['a component that is not text', { project: ['web'] }],
	])('drops %s', (_label, search) => {
		expect(validateDeploymentsSearch(search)).toEqual({ project: undefined, status: undefined, page: undefined });
	});
});

describe('filterableStatuses', () => {
	it('offers staged only where staging exists (Harper 5.3.0+)', () => {
		expect(filterableStatuses(true)).toContain('staged');
		expect(filterableStatuses(false)).not.toContain('staged');
		expect(filterableStatuses(false)).toContain('success');
	});
});
