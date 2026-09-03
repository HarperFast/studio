import { AxiosError } from 'axios';
import { describe, expect, it } from 'vitest';
import {
	describeAuthFailure,
	describeRetryableAuthFailure,
	OUTCOME_UNKNOWN_MESSAGE,
	SERVER_ERROR_MESSAGE,
	SERVER_UNAVAILABLE_MESSAGE,
	SERVER_UNREACHABLE_MESSAGE,
	TOO_MANY_ATTEMPTS_MESSAGE,
} from './describeAuthFailure';

function responded(status: number, data?: unknown): AxiosError {
	return {
		isAxiosError: true,
		code: 'ERR_BAD_RESPONSE',
		message: `Request failed with status code ${status}`,
		response: { status, data },
	} as AxiosError;
}

function transportFailure(code: string): AxiosError {
	return { isAxiosError: true, code, message: 'Network Error' } as AxiosError;
}

describe('describeRetryableAuthFailure', () => {
	// 503 alone: the server declined the request, so it very likely never processed it.
	it('offers a retry for a 503', () => {
		expect(describeRetryableAuthFailure(responded(503))).toBe(SERVER_UNAVAILABLE_MESSAGE);
	});

	it.each([500, 501, 505])('does not promise a retry helps for a %i', (status) => {
		expect(describeRetryableAuthFailure(responded(status))).toBe(SERVER_ERROR_MESSAGE);
	});

	// Every form using this submits a non-idempotent POST, so a timeout leaves the write's outcome
	// unknown — inviting a retry turns a completed sign-up into a 409 (#1668). A 504 and a
	// client-side give-up are the same situation and get the same answer.
	// A 502 is the same situation as a 504: the gateway had already handed the request upstream.
	it.each([502, 504])('says the outcome is unknown after a %i', (status) => {
		expect(describeRetryableAuthFailure(responded(status))).toBe(OUTCOME_UNKNOWN_MESSAGE);
	});

	it.each([
		['problem details', { code: 'Unavailable', title: 'Signup is unavailable' }],
		['a plain sentence', 'Service is restarting, try again shortly'],
		['a legacy error field', { error: 'connect ECONNREFUSED 10.0.3.14:9925' }],
		['an edge proxy HTML page', '<!doctype html><html><body>503</body></html>'],
		['an unrecognized JSON shape', { statusCode: 503 }],
		['a whitespace-only title', { title: '   ' }],
	])('still answers with our own copy when a 503 body carries %s', (_label, data) => {
		expect(describeRetryableAuthFailure(responded(503, data))).toBe(SERVER_UNAVAILABLE_MESSAGE);
	});

	it('keeps a 500 body out of the alert too', () => {
		expect(describeRetryableAuthFailure(responded(500, { error: 'connect ECONNREFUSED 10.0.3.14:9925' })))
			.toBe(SERVER_ERROR_MESSAGE);
	});

	it('names a throttle rather than blaming the server', () => {
		expect(describeRetryableAuthFailure(responded(429))).toBe(TOO_MANY_ATTEMPTS_MESSAGE);
		expect(describeRetryableAuthFailure(responded(429, { error: 'Too many requests' })))
			.toBe(TOO_MANY_ATTEMPTS_MESSAGE);
	});

	it.each([400, 401, 403, 404, 409])('leaves a %i to the server, even with no body', (status) => {
		expect(describeRetryableAuthFailure(responded(status))).toBeUndefined();
	});

	it('reports a network failure as unreachable, and says to reload first', () => {
		expect(describeRetryableAuthFailure(transportFailure(AxiosError.ERR_NETWORK)))
			.toBe(SERVER_UNREACHABLE_MESSAGE);
		// A connection dropped after the request was sent has the same unknown outcome as a timeout,
		// so this copy must not invite a bare retry either.
		expect(SERVER_UNREACHABLE_MESSAGE).toContain('reload');
	});

	// The branches key off string literals; if one is a code axios never emits, the branch is dead
	// and the failure it was meant to describe silently falls through to the raw status line.
	it('only routes codes axios actually defines', () => {
		const axiosCodes = new Set(Object.values(AxiosError).filter((v) => typeof v === 'string'));
		for (const code of ['ERR_NETWORK', 'ETIMEDOUT', 'ECONNABORTED']) {
			expect(axiosCodes.has(code)).toBe(true);
		}
	});

	it.each([AxiosError.ECONNABORTED, AxiosError.ETIMEDOUT])(
		'says the outcome is unknown after a %s, rather than inviting a retry',
		(code) => {
			expect(describeRetryableAuthFailure(transportFailure(code))).toBe(OUTCOME_UNKNOWN_MESSAGE);
		},
	);

	it.each([AxiosError.ERR_CANCELED, AxiosError.ERR_INVALID_URL, AxiosError.ERR_BAD_OPTION])(
		'makes no claim about %s',
		(code) => {
			expect(describeRetryableAuthFailure(transportFailure(code))).toBeUndefined();
		},
	);

	it('leaves a plain Error from our own request wrapper alone', () => {
		expect(describeRetryableAuthFailure(new Error('Something went wrong'))).toBeUndefined();
	});

	it('tolerates a non-error', () => {
		expect(describeRetryableAuthFailure(undefined)).toBeUndefined();
		expect(describeRetryableAuthFailure('nope')).toBeUndefined();
		expect(describeRetryableAuthFailure({ isAxiosError: true, response: {} })).toBeUndefined();
	});
});

describe('describeAuthFailure', () => {
	it('falls back to the server text for anything not retryable', () => {
		expect(describeAuthFailure(responded(401, { error: 'Invalid email or password' })))
			.toBe('Invalid email or password');
	});

	it('replaces the raw status line for a 503', () => {
		expect(describeAuthFailure(responded(503))).toBe(SERVER_UNAVAILABLE_MESSAGE);
	});
});
