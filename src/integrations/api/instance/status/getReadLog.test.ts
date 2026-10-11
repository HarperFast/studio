import type { AxiosInstance } from 'axios';
import { AxiosError } from 'axios';
import { describe, expect, it } from 'vitest';
import { buildReadLogBody, clampReadLogLimit, getReadLogQueryOptions, MAX_READ_LOG_LIMIT } from './getReadLog';

describe('clampReadLogLimit', () => {
	it('returns undefined for blank or invalid input', () => {
		expect(clampReadLogLimit(undefined)).toBeUndefined();
		expect(clampReadLogLimit(null)).toBeUndefined();
		expect(clampReadLogLimit('')).toBeUndefined();
		expect(clampReadLogLimit('abc')).toBeUndefined();
		expect(clampReadLogLimit('0')).toBeUndefined();
		expect(clampReadLogLimit('-5')).toBeUndefined();
	});

	it('passes values at or below the ceiling through unchanged', () => {
		expect(clampReadLogLimit('100')).toBe(100);
		expect(clampReadLogLimit(String(MAX_READ_LOG_LIMIT))).toBe(MAX_READ_LOG_LIMIT);
	});

	it('clamps values above the ceiling', () => {
		expect(clampReadLogLimit('999999')).toBe(MAX_READ_LOG_LIMIT);
	});
});

describe('buildReadLogBody', () => {
	it('clamps an oversized limit before it reaches the wire', () => {
		expect(buildReadLogBody({ limit: '5000000' }, false).limit).toBe(MAX_READ_LOG_LIMIT);
	});

	it('omits limit entirely when the field is blank', () => {
		expect(buildReadLogBody({ limit: '' }, false).limit).toBeUndefined();
	});
});

describe('read_log auto-refresh', () => {
	function intervalFor(isAutoRefreshEnabled: boolean) {
		const { refetchInterval } = getReadLogQueryOptions(
			{
				entityId: 'ins-test' as never,
				instanceClient: {} as AxiosInstance,
				logFilters: {},
				replicated: false,
				isAutoRefreshEnabled,
			} as Parameters<typeof getReadLogQueryOptions>[0],
		);
		return refetchInterval as unknown as (query: { state: { error: unknown; errorUpdatedAt?: number } }) => unknown;
	}

	it('refreshes every 5s only while auto-refresh is on', () => {
		expect(intervalFor(true)({ state: { error: null } })).toBe(5_000);
		expect(intervalFor(false)({ state: { error: null } })).toBe(false);
	});

	it('stops auto-refreshing a log the user may not read', () => {
		const forbidden = new AxiosError('Request failed with status code 403');
		forbidden.response = { status: 403 } as AxiosError['response'];
		expect(intervalFor(true)({ state: { error: forbidden, errorUpdatedAt: 0 } })).toBe(false);
	});
});
