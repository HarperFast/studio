import { AxiosError } from 'axios';
import { describe, expect, it } from 'vitest';
import { isForbiddenError, pollUnlessForbidden, retryUnlessForbidden } from './pollUnlessForbidden';

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

describe('retryUnlessForbidden', () => {
	it('never retries a 403', () => {
		// Without this the 403 sits in `failureReason` for three more requests and
		// `pollUnlessForbidden` cannot see it until ~30s later.
		expect(retryUnlessForbidden()(1, axiosErrorWithStatus(403))).toBe(false);
	});

	it('matches the default retry: 3 budget for transient failures', () => {
		const retry = retryUnlessForbidden();
		expect(retry(1, axiosErrorWithStatus(503))).toBe(true);
		expect(retry(2, axiosErrorWithStatus(503))).toBe(true);
		expect(retry(3, axiosErrorWithStatus(503))).toBe(false);
	});

	it('still retries a 401, which the auth layer resolves by re-authenticating', () => {
		expect(retryUnlessForbidden()(1, axiosErrorWithStatus(401))).toBe(true);
	});

	it('honors a custom retry budget', () => {
		const retry = retryUnlessForbidden(1);
		expect(retry(0, new Error('Network Error'))).toBe(true);
		expect(retry(1, new Error('Network Error'))).toBe(false);
	});
});
