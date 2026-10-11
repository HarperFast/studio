import { errorStatus } from '@/lib/errorStatus';

/** The only part of React Query's `Query` this wrapper reads. Typed structurally
 *  (rather than as `Query`) because `Query` is invariant in its data type, so a
 *  concrete `Query<StatusResponse, …>` will not accept a `(query: Query) => …`
 *  callback. A supertype parameter accepts every instantiation. */
interface QueryErrorState {
	state: { error: unknown; errorUpdatedAt?: number; dataUpdatedAt?: number };
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

const MAX_FAILING_POLL_INTERVAL_MS = 5 * 60_000;

/** How long a run of 5xx keeps the configured interval before it backs off like a 400,
 *  measured from the run's first *settled* error — after the query's own retries. */
const SERVER_ERROR_GRACE_MS = 60_000;

const failingSince = new WeakMap<QueryErrorState, number>();

function isServerError(status: number | undefined): boolean {
	return status !== undefined && status >= 500 && status < 600;
}

/** Only a success (`dataUpdatedAt` passing the recorded start) ends a run. A null `error`
 *  must not: on a query that has never loaded, React Query resets `error` to null at the
 *  start of every fetch, so the run would restart on every tick. */
function failingPollInterval(query: QueryErrorState, interval: number, graceMs: number): number {
	const { errorUpdatedAt, dataUpdatedAt = 0 } = query.state;
	if (!Number.isFinite(errorUpdatedAt)) {
		return interval;
	}
	let since = failingSince.get(query);
	if (since === undefined || since < dataUpdatedAt) {
		since = errorUpdatedAt!;
		failingSince.set(query, since);
	}
	const streak = errorUpdatedAt! - since - graceMs;
	return Math.min(Math.max(interval, streak), Math.max(interval, MAX_FAILING_POLL_INTERVAL_MS));
}

/**
 * Wrap a fixed poll interval so polling STOPS once the endpoint answers 403, and
 * BACKS OFF while it keeps answering 400 or 5xx.
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
 * Only 403 stops the timer. A 400 does NOT, even though it is just as deterministic
 * (`isDeterministicRejection`): halting would freeze a poll whose 400 came from state
 * that is still settling — a certificate challenge mid-provision, an argument derived
 * from a not-yet-loaded resource — until the user remounts or refocuses the tab. A 5xx
 * must not stop it either, so the row shows the instance coming back on its own.
 *
 * Instead the next tick waits as long as the run of failures has lasted, clamped to
 * [`interval`, 5min]. A 5xx tick first subtracts a one-minute grace, so a restart or a
 * brief outage is still picked up at the configured cadence. Any success ends the run;
 * 400s and 5xx in between share one run. Network failures and timeouts keep the base
 * interval. This paces only the timer; remount, refocus, and invalidation still refetch.
 */
export function pollUnlessForbidden(interval: number | false | undefined) {
	return (query: QueryErrorState) => {
		const status = errorStatus(query.state.error);
		if (status === 403) {
			return false;
		}
		if (!interval) {
			return interval ?? false;
		}
		if (status === 400) {
			return failingPollInterval(query, interval, 0);
		}
		return isServerError(status) ? failingPollInterval(query, interval, SERVER_ERROR_GRACE_MS) : interval;
	};
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
 * For 400 the poll timer keeps running, backed off (see `pollUnlessForbidden`) —
 * this removes the retry amplification, which is worth two distinct things:
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
