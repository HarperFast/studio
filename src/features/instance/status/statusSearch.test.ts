import { describe, expect, it } from 'vitest';
import { STATUS_SEARCH_DEFAULTS, validateStatusSearch } from './statusSearch';

describe('validateStatusSearch', () => {
	it('passes through valid values', () => {
		expect(validateStatusSearch({ tab: 'traffic', range: '6h', refresh: 30_000, jobsRefresh: 300_000 })).toEqual({
			tab: 'traffic',
			range: '6h',
			refresh: 30_000,
			jobsRefresh: 300_000,
		});
	});

	it('falls back to defaults for missing values', () => {
		expect(validateStatusSearch({})).toEqual(STATUS_SEARCH_DEFAULTS);
	});

	it('falls back to defaults for invalid values', () => {
		expect(validateStatusSearch({ tab: 'garbage', range: '999y', refresh: 1234, jobsRefresh: 1234 })).toEqual(
			STATUS_SEARCH_DEFAULTS,
		);
	});

	it("defaults the charts' auto-refresh to 60s and Jobs' to off", () => {
		const { refresh, jobsRefresh } = validateStatusSearch({});
		expect(refresh).toBe(60_000);
		expect(jobsRefresh).toBe(0);
	});

	it('reads each tab kind its own interval, so neither choice turns the other on', () => {
		expect(validateStatusSearch({ refresh: 30_000 }).jobsRefresh).toBe(0);
		expect(validateStatusSearch({ jobsRefresh: 30_000 }).refresh).toBe(60_000);
	});

	it('coerces a string refresh (URL-sourced) to its numeric option', () => {
		expect(validateStatusSearch({ refresh: '30000' }).refresh).toBe(30_000);
		expect(validateStatusSearch({ jobsRefresh: '30000' }).jobsRefresh).toBe(30_000);
	});

	it('treats an empty-string refresh as missing, not as 0/Off', () => {
		expect(validateStatusSearch({ refresh: '' }).refresh).toBe(STATUS_SEARCH_DEFAULTS.refresh);
		expect(validateStatusSearch({ jobsRefresh: '' }).jobsRefresh).toBe(STATUS_SEARCH_DEFAULTS.jobsRefresh);
	});

	it('keeps refresh=0 (auto-refresh off) instead of defaulting it', () => {
		expect(validateStatusSearch({ refresh: 0 }).refresh).toBe(0);
		expect(validateStatusSearch({ refresh: '0' }).refresh).toBe(0);
	});
});
