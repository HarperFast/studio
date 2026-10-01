import { AxiosError } from 'axios';
import { describe, expect, it } from 'vitest';
import {
	isDeterministicRejection,
	isForbiddenError,
	pollUnlessForbidden,
	retryUnlessRejected,
} from './pollUnlessForbidden';

/** Minimal stand-in for the `query` argument `refetchInterval` receives — the
 *  wrapper only ever reads `state.error`. */
function queryWithError(error: unknown) {
	return { state: { error } };
}

function axiosErrorWithStatus(status: number): AxiosError {
	const err = new AxiosError(`Request failed with status code ${status}`);
	err.response = { status } as AxiosError['response'];
	return err;
}

describe('isForbiddenError', () => {
	it('detects an axios 403', () => {
		expect(isForbiddenError(axiosErrorWithStatus(403))).toBe(true);
	});

	it('detects a bare { status } shape', () => {
		expect(isForbiddenError({ status: 403 })).toBe(true);
	});

	it('is false for other statuses, including 401', () => {
		expect(isForbiddenError(axiosErrorWithStatus(401))).toBe(false);
		expect(isForbiddenError(axiosErrorWithStatus(500))).toBe(false);
	});

	it('is false for non-HTTP errors and nullish input', () => {
		expect(isForbiddenError(new Error('Network Error'))).toBe(false);
		expect(isForbiddenError(null)).toBe(false);
		expect(isForbiddenError(undefined)).toBe(false);
	});
});

describe('pollUnlessForbidden', () => {
	it('keeps the interval while the query is healthy', () => {
		expect(pollUnlessForbidden(10_000)(queryWithError(null))).toBe(10_000);
	});

	it('stops polling once the query errors with 403', () => {
		expect(pollUnlessForbidden(10_000)(queryWithError(axiosErrorWithStatus(403)))).toBe(false);
	});

	it('keeps polling through transient failures so the UI self-heals', () => {
		// 5xx / network / 401 are recoverable states (instance restarting, session
		// re-established) — only a 403 is stable enough to stop on.
		for (const status of [401, 500, 502, 503]) {
			expect(pollUnlessForbidden(10_000)(queryWithError(axiosErrorWithStatus(status)))).toBe(10_000);
		}
		expect(pollUnlessForbidden(10_000)(queryWithError(new Error('Network Error')))).toBe(10_000);
	});

	it('normalizes a disabled interval to false', () => {
		expect(pollUnlessForbidden(undefined)(queryWithError(null))).toBe(false);
		expect(pollUnlessForbidden(false)(queryWithError(null))).toBe(false);
	});

	it('preserves a custom (non-10s) interval', () => {
		expect(pollUnlessForbidden(2_000)(queryWithError(null))).toBe(2_000);
	});
});

const FIVE_MINUTES = 5 * 60_000;

describe('pollUnlessForbidden on a sustained 400', () => {
	/** React Query hands `refetchInterval` the same `Query` every time and replaces its
	 *  `state`, so the tests do the same: one object, state swapped per update. */
	function pollingQuery() {
		const query: { state: { error: unknown; errorUpdatedAt?: number; dataUpdatedAt?: number } } = {
			state: { error: null, dataUpdatedAt: 0 },
		};
		const poll = pollUnlessForbidden(10_000);
		return {
			rejectAt(at: number) {
				query.state = { ...query.state, error: axiosErrorWithStatus(400), errorUpdatedAt: at };
				return poll(query);
			},
			rejectAfterUnseenSuccess(succeededAt: number, at: number) {
				query.state = { error: axiosErrorWithStatus(400), errorUpdatedAt: at, dataUpdatedAt: succeededAt };
				return poll(query);
			},
			succeedAt(at: number) {
				query.state = { ...query.state, error: null, dataUpdatedAt: at };
				return poll(query);
			},
		};
	}

	it('waits as long as the run of 400s has lasted, from the base interval up', () => {
		const q = pollingQuery();
		expect(q.rejectAt(1_000_000)).toBe(10_000);
		expect(q.rejectAt(1_010_000)).toBe(10_000);
		expect(q.rejectAt(1_020_000)).toBe(20_000);
		expect(q.rejectAt(1_040_000)).toBe(40_000);
		expect(q.rejectAt(1_080_000)).toBe(80_000);
	});

	it('caps the back-off so a 400 that clears is still picked up', () => {
		const q = pollingQuery();
		q.rejectAt(0);
		expect(q.rejectAt(60 * 60_000)).toBe(FIVE_MINUTES);
	});

	it('returns to the base interval after a success, and a later 400 starts over', () => {
		const q = pollingQuery();
		q.rejectAt(1_000_000);
		expect(q.rejectAt(1_300_000)).toBe(FIVE_MINUTES);
		expect(q.succeedAt(1_310_000)).toBe(10_000);
		expect(q.rejectAt(1_320_000)).toBe(10_000);
		expect(q.rejectAt(1_330_000)).toBe(10_000);
		expect(q.rejectAt(1_340_000)).toBe(20_000);
	});

	it('starts a new run when a success landed between two 400s it never saw', () => {
		// The callback is not guaranteed to run on every state change; `dataUpdatedAt`
		// moving past the recorded start is what proves the earlier run ended.
		const q = pollingQuery();
		q.rejectAt(1_000_000);
		expect(q.rejectAt(1_200_000)).toBe(200_000);
		expect(q.rejectAfterUnseenSuccess(1_250_000, 1_260_000)).toBe(10_000);
	});

	it('keeps the run going through the null error React Query sets at each fetch start', () => {
		// On a query with no data, every fetch resets `error` to null before the next 400.
		const poll = pollUnlessForbidden(10_000);
		const query: { state: { error: unknown; errorUpdatedAt?: number; dataUpdatedAt?: number } } = {
			state: { error: axiosErrorWithStatus(400), errorUpdatedAt: 0, dataUpdatedAt: 0 },
		};
		poll(query);
		query.state = { error: null, errorUpdatedAt: 0, dataUpdatedAt: 0 };
		expect(poll(query)).toBe(10_000);
		query.state = { error: axiosErrorWithStatus(400), errorUpdatedAt: 40_000, dataUpdatedAt: 0 };
		expect(poll(query)).toBe(40_000);
	});

	it('does not back off other failures — 5xx and network errors keep the base interval', () => {
		const poll = pollUnlessForbidden(10_000);
		expect(poll({ state: { error: axiosErrorWithStatus(500), errorUpdatedAt: 60 * 60_000, dataUpdatedAt: 0 } }))
			.toBe(10_000);
		expect(poll({ state: { error: new Error('Network Error'), errorUpdatedAt: 60 * 60_000, dataUpdatedAt: 0 } }))
			.toBe(10_000);
	});

	it('keeps the run through a transient failure with no success in between', () => {
		const poll = pollUnlessForbidden(10_000);
		const query: { state: { error: unknown; errorUpdatedAt?: number; dataUpdatedAt?: number } } = {
			state: { error: axiosErrorWithStatus(400), errorUpdatedAt: 0, dataUpdatedAt: 0 },
		};
		poll(query);
		query.state = { error: axiosErrorWithStatus(502), errorUpdatedAt: 30_000, dataUpdatedAt: 0 };
		expect(poll(query)).toBe(10_000);
		query.state = { error: axiosErrorWithStatus(400), errorUpdatedAt: 60_000, dataUpdatedAt: 0 };
		expect(poll(query)).toBe(60_000);
	});

	it('tracks each query separately', () => {
		const poll = pollUnlessForbidden(10_000);
		const a = { state: { error: axiosErrorWithStatus(400), errorUpdatedAt: 0, dataUpdatedAt: 0 } };
		poll(a);
		a.state = { ...a.state, errorUpdatedAt: 120_000 };
		const b = { state: { error: axiosErrorWithStatus(400), errorUpdatedAt: 120_000, dataUpdatedAt: 0 } };
		expect(poll(a)).toBe(120_000);
		expect(poll(b)).toBe(10_000);
	});

	it('falls back to the base interval when the error timestamp is missing or invalid', () => {
		const poll = pollUnlessForbidden(10_000);
		expect(poll({ state: { error: axiosErrorWithStatus(400) } })).toBe(10_000);
		expect(poll({ state: { error: axiosErrorWithStatus(400), errorUpdatedAt: Number.NaN } })).toBe(10_000);
	});

	it('backs a 5s poll off from 5s', () => {
		const poll = pollUnlessForbidden(5_000);
		const query = { state: { error: axiosErrorWithStatus(400), errorUpdatedAt: 0, dataUpdatedAt: 0 } };
		expect(poll(query)).toBe(5_000);
		query.state = { ...query.state, errorUpdatedAt: 5_000 };
		expect(poll(query)).toBe(5_000);
		query.state = { ...query.state, errorUpdatedAt: 10_000 };
		expect(poll(query)).toBe(10_000);
	});

	it('never shortens an interval already longer than the cap', () => {
		const poll = pollUnlessForbidden(10 * 60_000);
		const query = { state: { error: axiosErrorWithStatus(400), errorUpdatedAt: 0, dataUpdatedAt: 0 } };
		poll(query);
		query.state = { ...query.state, errorUpdatedAt: 60 * 60_000 };
		expect(poll(query)).toBe(10 * 60_000);
	});
});

describe('isDeterministicRejection', () => {
	it('covers 400 and 403 — the statuses an unchanged retry cannot change', () => {
		expect(isDeterministicRejection(axiosErrorWithStatus(400))).toBe(true);
		expect(isDeterministicRejection(axiosErrorWithStatus(403))).toBe(true);
		expect(isDeterministicRejection({ status: 400 })).toBe(true);
	});

	it('is narrower than "all 4xx"', () => {
		// 401 is resolved by the auth layer re-authenticating; 404/409 can reflect a
		// resource that is still being created.
		for (const status of [401, 404, 409, 429, 500, 503]) {
			expect(isDeterministicRejection(axiosErrorWithStatus(status))).toBe(false);
		}
	});

	it('is false for non-HTTP errors and nullish input', () => {
		expect(isDeterministicRejection(new Error('Network Error'))).toBe(false);
		expect(isDeterministicRejection(null)).toBe(false);
		expect(isDeterministicRejection(undefined)).toBe(false);
	});
});

describe('retryUnlessRejected', () => {
	it('never retries a 403', () => {
		// Without this the 403 sits in `failureReason` for three more requests and
		// `pollUnlessForbidden` cannot see it until ~30s later.
		expect(retryUnlessRejected()(1, axiosErrorWithStatus(403))).toBe(false);
	});

	it('never retries a 400', () => {
		// A validator/parser rejection of the request itself: a retry sends the identical
		// bytes and can only be rejected identically. On the callers left at default
		// exponential backoff that cost 4 requests per poll tick instead of 1
		// (RUM 2026-08-07).
		expect(retryUnlessRejected()(0, axiosErrorWithStatus(400))).toBe(false);
		expect(retryUnlessRejected()(1, axiosErrorWithStatus(400))).toBe(false);
	});

	it('matches the default retry: 3 budget for transient failures', () => {
		const retry = retryUnlessRejected();
		expect(retry(1, axiosErrorWithStatus(503))).toBe(true);
		expect(retry(2, axiosErrorWithStatus(503))).toBe(true);
		expect(retry(3, axiosErrorWithStatus(503))).toBe(false);
	});

	it('still retries a 401, which the auth layer resolves by re-authenticating', () => {
		expect(retryUnlessRejected()(1, axiosErrorWithStatus(401))).toBe(true);
	});

	it('honors a custom retry budget', () => {
		const retry = retryUnlessRejected(1);
		expect(retry(0, new Error('Network Error'))).toBe(true);
		expect(retry(1, new Error('Network Error'))).toBe(false);
	});
});
