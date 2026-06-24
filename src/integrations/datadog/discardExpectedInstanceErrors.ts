/**
 * A structural subset of Datadog's RUM event, covering only the fields this filter
 * inspects. Kept narrow so it stays assignable to RUM's `beforeSend` signature.
 */
export interface DatadogErrorEvent {
	type: string;
	error?: {
		message?: string;
		source?: string;
		resource?: { url?: string };
	};
}

/**
 * Reaching an instance can legitimately fail when it's down, restarting, or the
 * user lacks Fabric Connect — these are expected states, not Studio bugs, and they
 * otherwise flood Error Tracking. Drop connectivity-class errors (timeouts, network
 * failures) so they don't create issues.
 *
 * These errors reach RUM two ways: as tracked resource errors (which carry an
 * `error.resource.url`) and as handled AxiosErrors surfaced through `console.error`
 * — most notably React Query's global error handler — which do NOT. The URL-based
 * endpoint check below only ever sees the former, so the URL-less timeouts slipped
 * past it and flooded Error Tracking (issue #1371).
 *
 * Returning false discards the event entirely.
 */
export function discardExpectedInstanceErrors(event: DatadogErrorEvent) {
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

	// A request timeout is a connectivity-class failure, never a Studio bug: the
	// instance, cluster, or backend was too slow to answer in time. Unlike the
	// network failures below we drop these unconditionally, because the handled
	// AxiosErrors that flood Error Tracking carry no resource URL to attribute them
	// to an endpoint. Backend latency is tracked server-side, not from the browser.
	if (/timeout of \d+ms exceeded/i.test(message)) {
		return false;
	}

	// Other network failures (connection refused, DNS, offline) against an
	// instance/cluster operation endpoint — expected when the instance is unreachable.
	const url = event.error?.resource?.url ?? '';
	const isInstanceEndpoint = /\/(HDBInstance|Cluster)\/[^/]+\/operation/.test(url);
	const isNetworkFailure = /Network Error/i.test(message) || source === 'network';
	if (isInstanceEndpoint && isNetworkFailure) {
		return false;
	}

	return true;
}
