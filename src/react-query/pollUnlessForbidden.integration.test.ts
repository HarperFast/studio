/** @vitest-environment jsdom */
import { getStatusQueryOptions } from '@/integrations/api/instance/status/getStatus';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import type { AxiosInstance } from 'axios';
import { AxiosError } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * End-to-end against a REAL QueryClient, driving the real `getStatusQueryOptions`.
 *
 * The unit tests next to each query prove the predicate returns the right number;
 * they cannot prove React Query ever consults it. This file pins the three behaviors
 * the fix actually rests on:
 *   1. a 403 halts the poll timer (and the retries that would delay it),
 *   2. a transient 5xx does NOT halt it, and
 *   3. a later success re-arms it — so "stopped" never means "dead until reload".
 *
 * jsdom is REQUIRED, not incidental. query-core computes
 * `isServer = typeof window === 'undefined'`, and `QueryObserver#updateRefetchInterval`
 * returns before `setInterval` when `isServer()` is true. Under vitest's default node
 * environment no interval is ever armed, so every polling assertion passes vacuously —
 * a 5xx test "keeping polling" would actually just be counting retries.
 */
describe('poll-stops-on-403, end to end', () => {
	let queryClient: QueryClient;

	beforeEach(() => {
		vi.useFakeTimers();
		queryClient = new QueryClient();
	});

	afterEach(() => {
		queryClient.clear();
		vi.useRealTimers();
	});

	function httpError(status: number): AxiosError {
		const err = new AxiosError(`Request failed with status code ${status}`);
		err.response = { status } as AxiosError['response'];
		return err;
	}

	const okStatus = { data: { systemStatus: [], restartRequired: false, componentStatus: [] } };

	/** Subscribe an observer to the real production query options. */
	function observe(post: ReturnType<typeof vi.fn>) {
		const observer = new QueryObserver(
			queryClient,
			getStatusQueryOptions(
				{ entityId: 'ins-test' as never, instanceClient: { post } as unknown as AxiosInstance },
				true,
			),
		);
		return { observer, unsubscribe: observer.subscribe(() => {}) };
	}

	it('polls on a 10s timer while healthy (guards the jsdom requirement above)', async () => {
		const post = vi.fn().mockResolvedValue(okStatus);
		const { unsubscribe } = observe(post);

		await vi.advanceTimersByTimeAsync(60_000);

		// 1 mount fetch + ~6 polls. If this ever drops to 1, the environment stopped
		// arming intervals and every other assertion here is vacuous.
		expect(post.mock.calls.length).toBeGreaterThan(4);
		unsubscribe();
	});

	it('makes exactly one request on a 403 — no retries, no further polls', async () => {
		const post = vi.fn().mockRejectedValue(httpError(403));
		const { unsubscribe } = observe(post);

		await vi.advanceTimersByTimeAsync(60_000);

		// Without `retryUnlessForbidden` the default retry: 3 would fire 3 doomed
		// requests before the timer could even see the error; without
		// `pollUnlessForbidden` it would then poll for as long as the page is open.
		expect(post).toHaveBeenCalledTimes(1);
		unsubscribe();
	});

	it('keeps polling through a transient 5xx so the UI self-heals', async () => {
		const post = vi.fn().mockRejectedValue(httpError(503));
		const { unsubscribe } = observe(post);

		await vi.advanceTimersByTimeAsync(60_000);

		// Retries alone would cap at 3; anything beyond that is the poll timer still running.
		expect(post.mock.calls.length).toBeGreaterThan(3);
		unsubscribe();
	});

	it('re-arms the timer once access is restored', async () => {
		const post = vi.fn().mockRejectedValue(httpError(403));
		const { observer, unsubscribe } = observe(post);

		await vi.advanceTimersByTimeAsync(60_000);
		expect(post).toHaveBeenCalledTimes(1);

		// What a window-focus or remount refetch does after permissions are granted.
		post.mockResolvedValue(okStatus);
		await observer.refetch();
		const afterRecovery = post.mock.calls.length;

		await vi.advanceTimersByTimeAsync(60_000);

		expect(post.mock.calls.length).toBeGreaterThan(afterRecovery);
		unsubscribe();
	});
});
