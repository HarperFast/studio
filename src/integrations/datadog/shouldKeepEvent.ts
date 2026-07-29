/**
 * A structural subset of Datadog's RUM event, covering only the fields this filter
 * inspects. Kept narrow so it stays assignable to RUM's `beforeSend` signature.
 */
export interface DatadogErrorEvent {
	type: string;
	error?: {
		message?: string;
		source?: string;
		stack?: string;
		resource?: { url?: string };
	};
}

/**
 * Scripts we embed but do not ship or control — currently only the Reo.dev analytics
 * bundle (`src/integrations/reo/reo.ts` loads it from this CDN). Errors thrown inside
 * them are vendor bugs we can neither reproduce nor fix.
 */
const THIRD_PARTY_SCRIPT_FRAME = /https?:\/\/static\.reo\.dev\//;

/**
 * The Datadog browser SDK monkey-patches `fetch`/XHR, so its own bundle sits at the top
 * of every stack it instruments — including stacks whose real origin is third-party.
 * Treat it as instrumentation rather than as a Studio frame when attributing an error.
 */
const INSTRUMENTATION_FRAME = /\/assets\/vendor-datadog-[^/\s]*\.js/;

/**
 * True when every located frame in the stack belongs to a third-party script (or to the
 * Datadog SDK's own instrumentation), i.e. no Studio code is on the stack at all.
 */
function originatesInThirdPartyScript(stack: string) {
	let sawThirdPartyFrame = false;
	for (const line of stack.split('\n')) {
		// Skips the leading message line and any frame the browser couldn't resolve to a URL.
		if (!/https?:\/\//.test(line)) {
			continue;
		}
		if (THIRD_PARTY_SCRIPT_FRAME.test(line)) {
			sawThirdPartyFrame = true;
		} else if (!INSTRUMENTATION_FRAME.test(line)) {
			// Studio code is on the stack, so the error is ours to answer for.
			return false;
		}
	}
	return sawThirdPartyFrame;
}

/**
 * Datadog `beforeSend` predicate: returns true to keep the event, false to discard
 * it (false is what tells RUM to drop the event). Wired straight into `beforeSend`.
 *
 * Reaching an instance can legitimately fail when it's down, restarting, or the
 * user lacks Fabric Connect — these are expected states, not Studio bugs, and they
 * otherwise flood Error Tracking. We drop connectivity-class errors (timeouts,
 * network failures) so they don't create issues.
 *
 * These errors reach RUM two ways: as tracked resource errors (which carry an
 * `error.resource.url`) and as handled AxiosErrors surfaced through `console.error`
 * — most notably React Query's global error handler — which do NOT. The URL-based
 * endpoint check below only ever sees the former, so the URL-less timeouts slipped
 * past it and flooded Error Tracking (issue #1371).
 */
export function shouldKeepEvent(event: DatadogErrorEvent) {
	if (event.type !== 'error') {
		return true;
	}
	const message = event.error?.message ?? '';
	const source = event.error?.source;

	// Aborted requests are client-initiated cancellations (navigating away, a
	// component unmounting, React Query cancelling an in-flight query) — not failures.
	// Safe to drop globally regardless of endpoint.
	if (/Request aborted/i.test(message)) {
		return false;
	}

	// Belt-and-suspenders: any stray "Fabric Connect not established" breadcrumb.
	if (message.includes('Fabric Connect not established')) {
		return false;
	}

	// `Object Not Found Matching Id:N, MethodName:update, ParamCount:4` is injected by a
	// browser extension, not thrown by Studio: it arrives as a bare string (so RUM records
	// `type: null` and "No stack, consider using an instance of Error") and only ever from
	// the handful of sessions whose user has the extension installed. In the wild a single
	// such session emits hundreds of these — on 2026-07-09, 2 sessions produced ~1160 events
	// in 24h, doubling total RUM error volume — so it drowns real signal in Error Tracking
	// without pointing at any Studio bug. Match the stable signature and drop it globally.
	if (/Object Not Found Matching Id:\d+, MethodName:/i.test(message)) {
		return false;
	}

	// "Missing requestHandler or method: <fn>" is Monaco's per-call symptom of a language
	// worker that never started: when a worker script fails to load (stale hashed chunk
	// after a redeploy, offline) or the tab is out of memory, Monaco silently swaps in a
	// main-thread fallback that cannot host foreign worker modules (monaco-yaml, JSON, …),
	// and then EVERY language-feature call — folding, links, symbols, validation, code
	// actions — rejects with this error for the rest of the session (issue #1406: 7
	// sessions emitted 161 of these in 7 days). The root causes carry their own, far more
	// useful signals ("Failed to fetch dynamically imported module", the DataCloneError
	// worker OOM of issue #1407), and the stale-deploy trigger now self-recovers via
	// `installStaleDeployReload` — this repeated per-call echo adds nothing but volume.
	if (/Missing requestHandler or method: /.test(message)) {
		return false;
	}

	// Errors thrown entirely inside an embedded third-party script are that vendor's bugs,
	// not Studio's: we can't reproduce them, fix them, or act on them, and they arrive with
	// stacks that point only at minified vendor code. Reo.dev alone contributed two distinct
	// "issues" to Error Tracking within a day of first appearing (2026-07-28): a
	// `RangeError: Invalid time zone specified: Etc/Unknown` from its own `DateTimeFormat`
	// call, and a `TypeError: Failed to fetch` when its beacon is blocked. Attribute on the
	// stack rather than the message, so a genuine Studio error that happens to share a
	// message is still kept.
	const stack = event.error?.stack ?? '';
	if (stack && originatesInThirdPartyScript(stack)) {
		return false;
	}

	// A request timeout is a connectivity-class failure, never a Studio bug: the
	// instance, cluster, or backend was too slow to answer in time. Unlike the
	// network failures below we drop these unconditionally, because the handled
	// AxiosErrors that flood Error Tracking carry no resource URL to attribute them
	// to an endpoint. Backend latency is tracked server-side, not from the browser.
	if (/timeout of \d+ms exceeded/i.test(message)) {
		return false;
	}

	// A 401 Unauthorized is an expected state, not a Studio bug: a session expires or the
	// user signs out while a query (most often the 10s instance status poll) is still in
	// flight, so the in-flight request 401s and the next poll fires before the redirect to
	// sign-in tears the query down. Like the timeouts above, these surface as handled
	// AxiosErrors through React Query's global error handler with no resource URL, so we
	// match on the message alone. The auth layer already handles the real consequence
	// (redirecting to sign-in). We deliberately do NOT drop 403 Forbidden — the user is
	// authenticated but lacks permission, which usually points to a UI bug (an action
	// shown that shouldn't be, or a mismatched resource id) worth keeping visible. (#1386)
	if (/Request failed with status code 401\b/i.test(message)) {
		return false;
	}

	const url = event.error?.resource?.url ?? '';
	const isInstanceEndpoint = /\/(HDBInstance|Cluster)\/[^/]+\/operation/.test(url);

	// A 5xx from an instance/cluster operation endpoint is the instance itself failing
	// to answer (broken, unsupported, or mid-restart) — a server-side condition tracked
	// on the backend, not a Studio bug. Only drop when the URL attributes it to the
	// operation endpoint; an unattributed 5xx could be a genuine failure worth keeping.
	const isServerError = /Request failed with status code 5\d\d\b/i.test(message);
	if (isInstanceEndpoint && isServerError) {
		return false;
	}

	// Other network failures (connection refused, DNS, offline) against an
	// instance/cluster operation endpoint — expected when the instance is unreachable.
	const isNetworkFailure = /Network Error/i.test(message) || source === 'network';
	if (isInstanceEndpoint && isNetworkFailure) {
		return false;
	}

	return true;
}
