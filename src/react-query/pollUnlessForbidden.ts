/** The only part of React Query's `Query` this wrapper reads. Typed structurally
 *  (rather than as `Query`) because `Query` is invariant in its data type, so a
 *  concrete `Query<StatusResponse, …>` will not accept a `(query: Query) => …`
 *  callback. A supertype parameter accepts every instantiation. */
interface QueryErrorState {
	state: { error: unknown };
}

/** HTTP status off an axios-style error, tolerating both the axios shape
 *  (`error.response.status`) and a bare `{ status }`. */
function errorStatus(err: unknown): number | undefined {
	return (err as { response?: { status?: number } })?.response?.status
		?? (err as { status?: number })?.status;
}

/** A 403 means the caller is authenticated but not permitted on this resource.
 *  Unlike a 401 (session lost — the auth layer clears auth and redirects), a 403
 *  is stable: the same request will keep failing until permissions change, so
 *  repeating it is pure waste. */
export function isForbiddenError(err: unknown): boolean {
	return errorStatus(err) === 403;
}

/** A rejection the server will repeat verbatim for an unchanged request.
 *
 *  400 — the request itself was refused by a validator/parser, not work that failed
 *  partway. Studio sends operations whose shape depends on the target's Harper build
 *  (unknown metric names, `bucket_ms`, operations a pre-4.6 instance doesn't
 *  implement), so a poll can 400 on every tick indefinitely.
 *  403 — authenticated but not permitted; stable until permissions change.
 *
 *  Both are deterministic, so an *immediate* retry of the same request can only
 *  produce the same status. This is deliberately narrower than "all 4xx": a 401 is
 *  resolved by the auth layer re-authenticating, and 404/409 can reflect a resource
 *  that is still being created. */
export function isDeterministicRejection(err: unknown): boolean {
	const status = errorStatus(err);
	return status === 400 || status === 403;
}

/**
 * Wrap a fixed poll interval so polling STOPS once the endpoint answers 403.
 *
 * `refetchInterval` fires on a timer regardless of the query's error state, so a
 * poll against a resource the user may not touch retries forever. On 2026-07-27 a
 * single session sat on `/$organizationId/$clusterId/instances/` for ~58 minutes
 * while three 10s polls — `GET /Cluster/{id}` and `POST /HDBInstance/{id}/operation`
 * for two instances — all 403'd: ~1,045 doomed requests and 525 handled errors, each
 * one a `console.error` + a toast through the global React Query error handler
 * (`queryClient.ts`). That one session was 525 of the 526 403s Studio reported to RUM
 * that day. 403s are deliberately kept in RUM (see `shouldKeepEvent`), so an
 * unbounded 403 poll also drowns real signal in Error Tracking.
 *
 * Stopping is not permanent: returning `false` only cancels the *timer*. The query
 * still refetches on remount and on window focus (`refetchOnWindowFocus` defaults to
 * true), so if the user is granted access the UI recovers on their next interaction
 * without a reload — it just no longer hammers the endpoint in the background.
 *
 * Only 403 stops the timer. 5xx, network failures, and timeouts are transient
 * (instance restarting, unreachable) and should keep polling so the UI self-heals.
 *
 * A 400 deliberately does NOT stop the timer, even though it is just as
 * deterministic (`isDeterministicRejection`). Halting on it would freeze a poll
 * whose 400 came from state that is still settling — a certificate challenge
 * mid-provision, an argument derived from a not-yet-loaded resource — until the user
 * remounts or refocuses the tab. `retryUnlessRejected` removes the retry
 * amplification instead, which is the part that is waste either way. Whether the
 * timer itself should stop on a *sustained* 400 is open in #1569.
 */
export function pollUnlessForbidden(interval: number | false | undefined) {
	return (query: QueryErrorState) => (isForbiddenError(query.state.error) ? false : (interval ?? false));
}

/**
 * `retry` predicate that gives up immediately on a deterministic rejection (400 /
 * 403) but otherwise keeps React Query's default retry count.
 *
 * For 403 this is what makes `pollUnlessForbidden` engage on the FIRST one.
 * `state.error` is only populated once retries are exhausted (until then the failure
 * lives in `failureReason`), so on a query left at the default `retry: 3` the poll
 * timer cannot see the 403 until three more doomed requests have gone out — ~30s
 * later on a query that also sets `retryDelay: 10_000`.
 *
 * For 400 the poll timer deliberately keeps running (see `pollUnlessForbidden`) —
 * this only removes the retry amplification, which is worth two distinct things:
 *
 *   - On the five callers that leave `retryDelay` at React Query's default
 *     exponential backoff (1s/2s/4s), a 400ing tick spent 4 requests inside ~7s.
 *     Those become 1.
 *   - On `getStatus`, which pins `retryDelay: 10_000`, the request *rate* was already
 *     one per interval, so nothing is saved there — what changes is latency to
 *     visibility: the 400 reaches `state.error`, the error handler, and the UI on the
 *     first request rather than ~30s later.
 *
 * RUM (2026-08-07) motivates it: 26 first-party 400s in 24h against a ~1–3/day
 * baseline, one page re-issuing the same rejected operation every ~60s for half an
 * hour.
 *
 * `failureCount < maxRetries` is exactly the semantics of the numeric form
 * (`retry: 3`), so transient failures keep the retry behavior they had before.
 */
export function retryUnlessRejected(maxRetries = 3) {
	return (failureCount: number, error: unknown) => !isDeterministicRejection(error) && failureCount < maxRetries;
}
