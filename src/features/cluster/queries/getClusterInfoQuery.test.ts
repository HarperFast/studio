import { AxiosError } from 'axios';
import { describe, expect, it } from 'vitest';
import { getClusterInfoQueryOptions } from './getClusterInfoQuery';

/** The subset of `Query` the `refetchInterval` callback reads. */
type ErrorStateQuery = { state: { error: unknown } };

function axiosErrorWithStatus(status: number): AxiosError {
	const err = new AxiosError(`Request failed with status code ${status}`);
	err.response = { status } as AxiosError['response'];
	return err;
}

function resolveInterval(refetch: boolean | number | undefined, error: unknown) {
	const { refetchInterval } = getClusterInfoQueryOptions('clu-test', refetch);
	expect(typeof refetchInterval).toBe('function');
	const resolve = refetchInterval as unknown as (q: ErrorStateQuery) => number | false;
	return resolve({ state: { error } });
}

describe('getClusterInfoQueryOptions polling', () => {
	it('defaults to a 10s poll when refetch is true', () => {
		expect(resolveInterval(true, null)).toBe(10_000);
	});

	it('honors an explicit interval', () => {
		expect(resolveInterval(2_000, null)).toBe(2_000);
	});

	it('does not poll when refetch is omitted', () => {
		expect(resolveInterval(undefined, null)).toBe(false);
	});

	it('stops polling after a 403 rather than retrying every 10s (RUM 2026-07-27)', () => {
		// One session emitted 349 doomed GET /Cluster/{id} requests in ~58 minutes.
		expect(resolveInterval(true, axiosErrorWithStatus(403))).toBe(false);
	});

	it('keeps polling after a recoverable failure', () => {
		expect(resolveInterval(true, axiosErrorWithStatus(500))).toBe(10_000);
		expect(resolveInterval(true, new Error('Network Error'))).toBe(10_000);
	});
});
