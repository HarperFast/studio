import { describe, expect, it } from 'vitest';
import { STATUS_SEARCH_DEFAULTS, validateStatusSearch } from './statusSearch';

describe('validateStatusSearch', () => {
	it('passes through valid values', () => {
		expect(validateStatusSearch({ tab: 'traffic', range: '6h', refresh: 30_000 })).toEqual({
			tab: 'traffic',
			range: '6h',
			refresh: 30_000,
		});
	});

	it('falls back to defaults for missing values', () => {
		expect(validateStatusSearch({})).toEqual(STATUS_SEARCH_DEFAULTS);
	});

	it('falls back to defaults for invalid values', () => {
		expect(validateStatusSearch({ tab: 'garbage', range: '999y', refresh: 1234 })).toEqual(
			STATUS_SEARCH_DEFAULTS,
		);
	});

	it('coerces a string refresh (URL-sourced) to its numeric option', () => {
		expect(validateStatusSearch({ refresh: '30000' }).refresh).toBe(30_000);
	});

	it('treats an empty-string refresh as missing, not as 0/Off', () => {
		expect(validateStatusSearch({ refresh: '' }).refresh).toBe(STATUS_SEARCH_DEFAULTS.refresh);
	});

	it('keeps refresh=0 (auto-refresh off) instead of defaulting it', () => {
		expect(validateStatusSearch({ refresh: 0 }).refresh).toBe(0);
		expect(validateStatusSearch({ refresh: '0' }).refresh).toBe(0);
	});
});
