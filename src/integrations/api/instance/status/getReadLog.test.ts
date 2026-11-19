import type { AxiosInstance } from 'axios';
import { AxiosError } from 'axios';
import { describe, expect, it, vi } from 'vitest';
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
		return refetchInterval as unknown as
			| ((query: { state: { error: unknown; errorUpdatedAt?: number } }) => unknown)
			| false;
	}

	it('refreshes every 5s only while auto-refresh is on', () => {
		const poll = intervalFor(true);
		expect(poll && poll({ state: { error: null } })).toBe(5_000);
		expect(intervalFor(false)).toBe(false);
	});

	it('stops auto-refreshing a log the user may not read', () => {
		const forbidden = new AxiosError('Request failed with status code 403');
		forbidden.response = { status: 403 } as AxiosError['response'];
		const poll = intervalFor(true);
		expect(poll && poll({ state: { error: forbidden, errorUpdatedAt: 0 } })).toBe(false);
	});
});

it('resolves relative windows at request time with a stable query identity and no until', () => {
	const now = vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-01T06:30:00Z'));
	try {
		const logFilters = { relative_minutes: '15' as const, until: '2026-11-01T00:00' };
		const params = {
			entityId: 'relative',
			instanceClient: {} as AxiosInstance,
			logFilters,
			replicated: false,
			isAutoRefreshEnabled: true,
		};
		const firstKey = getReadLogQueryOptions(params).queryKey;
		expect(buildReadLogBody(logFilters, false)).toMatchObject({ from: '2026-11-01T06:15:00.000Z', until: undefined });
		now.mockReturnValue(Date.parse('2026-11-01T06:40:00Z'));
		expect(buildReadLogBody(logFilters, false).from).toBe('2026-11-01T06:25:00.000Z');
		expect(getReadLogQueryOptions(params).queryKey).toEqual(firstKey);
	} finally {
		now.mockRestore();
	}
});

it('keeps non-live log reads manual across focus and reconnect events', () => {
	const options = getReadLogQueryOptions({
		entityId: 'manual',
		instanceClient: {} as AxiosInstance,
		logFilters: {},
		replicated: false,
		isAutoRefreshEnabled: false,
	});
	expect(options.refetchOnWindowFocus).toBe(false);
	expect(options.refetchOnReconnect).toBe(false);
	expect(options.refetchInterval).toBe(false);
});
