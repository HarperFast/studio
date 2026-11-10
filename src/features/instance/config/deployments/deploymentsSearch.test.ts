import { describe, expect, it } from 'vitest';
import { filterableStatuses, validateDeploymentsSearch } from './deploymentsSearch';

describe('validateDeploymentsSearch', () => {
	it('keeps a component, a known status and a later page', () => {
		expect(validateDeploymentsSearch({ project: ' web ', status: 'staged', page: '3' }))
			.toEqual({ project: 'web', status: 'staged', page: 3 });
		expect(validateDeploymentsSearch({ status: 'partial' }).status).toBe('partial');
		expect(validateDeploymentsSearch({ status: 'rolling_out' }).status).toBe('rolling_out');
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

	it.each([
		['5.4.0-alpha.1', true],
		['5.4.0-beta.2', true],
		['5.4.0', true],
		['5.3.5', false],
		[undefined, false],
	])('offers rolling_out and partial on Harper %s: %s', (version, offered) => {
		const statuses = filterableStatuses(true, version);
		expect(statuses.includes('rolling_out')).toBe(offered);
		expect(statuses.includes('partial')).toBe(offered);
		expect(statuses).toContain('staged');
	});
});

describe('validateDeploymentsSearch commit', () => {
	const SHA = '0123456789abcdef0123456789abcdef01234567';

	it('keeps a commit as given, full or abbreviated, since Harper compares it exactly', () => {
		expect(validateDeploymentsSearch({ sha: ` ${SHA} ` }).sha).toBe(SHA);
		expect(validateDeploymentsSearch({ sha: 'ABCDEF0' }).sha).toBe('ABCDEF0');
	});

	it.each([['a branch', 'main'], ['too short', 'abc12'], ['not text', [SHA]]])('drops %s', (_label, sha) => {
		expect(validateDeploymentsSearch({ sha }).sha).toBeUndefined();
	});
});
