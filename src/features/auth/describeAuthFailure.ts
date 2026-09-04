import { describeError } from '@/react-query/queryClient';
import { AxiosError } from 'axios';

export const SERVER_UNAVAILABLE_MESSAGE =
	"The server is temporarily unavailable. It isn't a problem with the details you entered — please try again in a moment.";
export const SERVER_ERROR_MESSAGE =
	"Something went wrong on our end. It isn't a problem with the details you entered, and trying again may not help.";
// Deliberately vague about how long: nothing here reads `Retry-After`.
export const TOO_MANY_ATTEMPTS_MESSAGE = 'Too many attempts. Please wait a short while before trying again.';
/**
 * States the uncertainty and stops. What to do about it is endpoint-specific — only the caller
 * knows whether the write it just made is safe to repeat — so each form appends its own recovery.
 */
export const OUTCOME_UNKNOWN_MESSAGE =
	"We didn't get an answer from the server, so we can't tell whether that went through.";

// 503 alone: the server is declining requests, so it very likely never processed this one and a
// plain retry is honest. (`curryRetryGatewayErrors` also classes 502/504 as retryable, but it is
// installed on instance clients only, never on `apiClient` — nothing retries these calls
// automatically, and the retry this copy invites is the user's own.)
const TRANSIENT_STATUSES: ReadonlySet<number> = new Set([503]);
// Every form using this submits a non-idempotent POST, and each of these means the request had
// already been handed upstream, so the write may have applied (RFC 9110 §9.2.2 — a retry is only
// safe once you know it did not). Repeating blindly turns a completed sign-up into a 409 with the
// verification mail already sent (#1668).
const OUTCOME_UNKNOWN_STATUSES: ReadonlySet<number> = new Set([502, 504]);
// Axios reports a request that got no response as ERR_NETWORK — including a CORS rejection, and
// including a connection that dropped *after* the POST was applied — so it cannot be described as
// "we couldn't reach the server". It is the same unknown outcome. ECONNABORTED/ETIMEDOUT are the
// timeout pair; which one axios uses depends on `transitional.clarifyTimeoutError`.
const OUTCOME_UNKNOWN_CODES: ReadonlySet<string> = new Set([
	AxiosError.ERR_NETWORK,
	AxiosError.ETIMEDOUT,
	AxiosError.ECONNABORTED,
]);

/**
 * Our own copy for a failure the server's own words shouldn't answer, or `undefined` to defer.
 *
 * Gates on status, never on the body: a 5xx body is infrastructure detail that must not reach these
 * anonymous forms, whose alert persists. AGENTS.md, "A 5xx body never reaches an auth form".
 *
 * `outcomeUnknownRecovery` is the caller's endpoint-specific advice for the case where the request
 * may already have applied — "check your inbox", "try signing in" — since a generic "try again"
 * would repeat the side effect this branch exists to avoid.
 */
export function describeRetryableAuthFailure(rawErr: unknown, outcomeUnknownRecovery: string): string | undefined {
	const outcomeUnknown = `${OUTCOME_UNKNOWN_MESSAGE} ${outcomeUnknownRecovery}`;
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
			return outcomeUnknown;
		}
		return TRANSIENT_STATUSES.has(status) ? SERVER_UNAVAILABLE_MESSAGE : SERVER_ERROR_MESSAGE;
	}
	// A plain `Error` from our own request wrappers has no `code` and keeps its message;
	// ERR_CANCELED is a local abort that reached nothing, and a config fault (ERR_INVALID_URL,
	// ERR_BAD_OPTION) never left the browser — none of those is ours to describe.
	const code = axiosErr?.code;
	return typeof code === 'string' && OUTCOME_UNKNOWN_CODES.has(code) ? outcomeUnknown : undefined;
}

/** Display text for an auth-form rejection, preferring whatever the server said. */
export function describeAuthFailure(rawErr: unknown, outcomeUnknownRecovery: string): string {
	return describeRetryableAuthFailure(rawErr, outcomeUnknownRecovery) ?? describeError(rawErr).message;
}
