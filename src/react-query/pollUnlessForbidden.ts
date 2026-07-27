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
 */
export function pollUnlessForbidden(interval: number | false | undefined) {
	return (query: QueryErrorState) => (isForbiddenError(query.state.error) ? false : (interval ?? false));
}

/**
 * `retry` predicate that gives up immediately on 403 but otherwise keeps React
 * Query's default retry count.
 *
 * Needed to make `pollUnlessForbidden` engage on the FIRST 403. `state.error` is
 * only populated once retries are exhausted (until then the failure lives in
 * `failureReason`), so on a query left at the default `retry: 3` the poll timer
 * cannot see the 403 until three more doomed requests have gone out — ~30s later
 * on a query that also sets `retryDelay: 10_000`.
 *
 * `failureCount < maxRetries` is exactly the semantics of the numeric form
 * (`retry: 3`), so transient failures keep the retry behavior they had before.
 */
export function retryUnlessForbidden(maxRetries = 3) {
	return (failureCount: number, error: unknown) => !isForbiddenError(error) && failureCount < maxRetries;
}
