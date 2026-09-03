import { describeError } from '@/react-query/queryClient';
import { AxiosError } from 'axios';

export const SERVER_UNAVAILABLE_MESSAGE =
	"The server is temporarily unavailable. It isn't a problem with the details you entered — please try again in a moment.";
export const SERVER_ERROR_MESSAGE =
	"Something went wrong on our end. It isn't a problem with the details you entered, and trying again may not help.";
// Deliberately vague about how long: nothing here reads `Retry-After`, so naming a duration would
// promise a window we have not been told.
export const TOO_MANY_ATTEMPTS_MESSAGE = 'Too many attempts. Please wait a short while before trying again.';
export const OUTCOME_UNKNOWN_MESSAGE =
	"The server didn't respond in time, so we can't tell whether that went through. Reload the page before trying again.";
export const SERVER_UNREACHABLE_MESSAGE =
	"We couldn't reach the server. Check your connection, then reload the page before trying again.";

// 503 alone: the server is declining requests, so it very likely never processed this one and a
// plain retry is honest. (`curryRetryGatewayErrors` also classes 502/504 as retryable, but it is
// installed on instance clients only, never on `apiClient` — nothing retries these calls
// automatically, and the retry this copy invites is the user's own.)
const TRANSIENT_STATUSES: ReadonlySet<number> = new Set([503]);
// Every form using this submits a non-idempotent POST, so anything that ends after the request was
// already handed upstream — a 502 or 504, axios giving up first, or a dropped connection — leaves
// the write's outcome unknown. Inviting a bare retry there can turn a completed sign-up into a 409
// with the verification mail already sent (#1668), so none of those says "try again" without
// saying "reload" first.
const OUTCOME_UNKNOWN_STATUSES: ReadonlySet<number> = new Set([502, 504]);
// A branch keyed off a code axios never sets is dead and falls through silently, so a test pins
// these against `AxiosError`'s own constants.
const UNREACHABLE_CODES: ReadonlySet<string> = new Set([AxiosError.ERR_NETWORK]);
// Which of the two axios uses depends on `transitional.clarifyTimeoutError`.
const TIMEOUT_CODES: ReadonlySet<string> = new Set([AxiosError.ETIMEDOUT, AxiosError.ECONNABORTED]);

/**
 * Our own copy for a failure the server's own words shouldn't answer, or `undefined` to defer.
 *
 * Gates on status, never on the body: a 5xx body is infrastructure detail that must not reach these
 * anonymous forms, whose alert persists. AGENTS.md, "A 5xx body never reaches an auth form".
 */
export function describeRetryableAuthFailure(rawErr: unknown): string | undefined {
	const axiosErr = rawErr as AxiosError;
	const status = axiosErr?.response?.status;
	if (typeof status === 'number') {
		if (status === 429) {
			return TOO_MANY_ATTEMPTS_MESSAGE;
		}
		if (status < 500) {
			return undefined;
		}
		if (OUTCOME_UNKNOWN_STATUSES.has(status)) {
			return OUTCOME_UNKNOWN_MESSAGE;
		}
		return TRANSIENT_STATUSES.has(status) ? SERVER_UNAVAILABLE_MESSAGE : SERVER_ERROR_MESSAGE;
	}
	const code = axiosErr?.code;
	if (typeof code !== 'string') {
		return undefined;
	}
	if (TIMEOUT_CODES.has(code)) {
		return OUTCOME_UNKNOWN_MESSAGE;
	}
	return UNREACHABLE_CODES.has(code) ? SERVER_UNREACHABLE_MESSAGE : undefined;
}

/** Display text for an auth-form rejection, preferring whatever the server said. */
export function describeAuthFailure(rawErr: unknown): string {
	return describeRetryableAuthFailure(rawErr) ?? describeError(rawErr).message;
}
