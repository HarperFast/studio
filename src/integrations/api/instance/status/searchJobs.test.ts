import type { AxiosInstance } from 'axios';
import { AxiosError } from 'axios';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSearchJobsQueryOptions, SEARCH_JOBS_OPERATION, searchJobs } from './searchJobs';

const HOUR = 60 * 60 * 1000;

function clientAnswering(data: unknown) {
	const post = vi.fn(async (_url: string, _body: Record<string, unknown>) => ({ data }));
	return { post, instanceClient: { post } as unknown as AxiosInstance };
}

function httpError(status: number): AxiosError {
	const err = new AxiosError(`Request failed with status code ${status}`);
	err.response = { status } as AxiosError['response'];
	return err;
}

afterEach(() => {
	vi.useRealTimers();
});

describe('searchJobs', () => {
	it('asks for jobs started since the window opened, with an upper bound past any clock skew', async () => {
		const { post, instanceClient } = clientAnswering([]);
		const now = Date.UTC(2026, 9, 11, 12, 0, 0);
		await searchJobs({ instanceClient, windowMs: HOUR, now });
		expect(post).toHaveBeenCalledWith('/', {
			operation: SEARCH_JOBS_OPERATION,
			from_date: new Date(now - HOUR).toISOString(),
			to_date: new Date(now + 24 * HOUR).toISOString(),
		});
	});

	it('orders jobs newest first, falling back to the creation time for a job with no start time', async () => {
		const { instanceClient } = clientAnswering([
			{ id: 'old', start_datetime: 1_000 },
			{ id: 'queued', created_datetime: 3_000 },
			{ id: 'new', start_datetime: 2_000 },
		]);
		const jobs = await searchJobs({ instanceClient, windowMs: HOUR, now: 10_000 });
		expect(jobs.map((job) => job.id)).toEqual(['queued', 'new', 'old']);
	});

	it('refuses an answer that is not a list rather than reporting no jobs', async () => {
		const { instanceClient } = clientAnswering({ message: 'unexpected' });
		await expect(searchJobs({ instanceClient, windowMs: HOUR, now: 0 })).rejects.toThrow(/other than a list/);
	});
});

describe('getSearchJobsQueryOptions', () => {
	const base = { entityId: 'ins-1' as never, windowMs: HOUR, enabled: true };

	it('keys on the entity and the window width, operation first', () => {
		const { instanceClient } = clientAnswering([]);
		const { queryKey } = getSearchJobsQueryOptions({ ...base, instanceClient, refreshMs: 60_000 });
		expect(queryKey).toEqual([SEARCH_JOBS_OPERATION, 'ins-1', HOUR]);
	});

	it('computes the window when it fetches, so each poll slides it forward', async () => {
		vi.useFakeTimers();
		const { post, instanceClient } = clientAnswering([]);
		const { queryFn } = getSearchJobsQueryOptions({ ...base, instanceClient, refreshMs: 60_000 });
		const run = queryFn as unknown as () => Promise<unknown>;

		vi.setSystemTime(Date.UTC(2026, 9, 11, 12, 0, 0));
		await run();
		vi.setSystemTime(Date.UTC(2026, 9, 11, 12, 1, 0));
		await run();

		const fromDates = post.mock.calls.map(([, body]) => body.from_date);
		expect(fromDates).toEqual([
			new Date(Date.UTC(2026, 9, 11, 11, 0, 0)).toISOString(),
			new Date(Date.UTC(2026, 9, 11, 11, 1, 0)).toISOString(),
		]);
	});

	function refetchIntervalFor(refreshMs: number, error: unknown) {
		const { instanceClient } = clientAnswering([]);
		const { refetchInterval } = getSearchJobsQueryOptions({ ...base, instanceClient, refreshMs });
		const resolve = refetchInterval as unknown as (query: { state: { error: unknown } }) => number | false;
		return resolve({ state: { error } });
	}

	it('polls at the chosen refresh interval', () => {
		expect(refetchIntervalFor(30_000, null)).toBe(30_000);
	});

	it('does not poll when auto-refresh is off', () => {
		expect(refetchIntervalFor(0, null)).toBe(false);
	});

	it('stops polling once Harper answers 403', () => {
		expect(refetchIntervalFor(30_000, httpError(403))).toBe(false);
	});

	it('keeps polling through a transient 5xx', () => {
		expect(refetchIntervalFor(30_000, httpError(503))).toBe(30_000);
	});

	it('does not retry a 403', () => {
		const { instanceClient } = clientAnswering([]);
		const { retry } = getSearchJobsQueryOptions({ ...base, instanceClient, refreshMs: 30_000 });
		const shouldRetry = retry as (failureCount: number, error: unknown) => boolean;
		expect(shouldRetry(0, httpError(403))).toBe(false);
		expect(shouldRetry(0, httpError(503))).toBe(true);
	});
});
