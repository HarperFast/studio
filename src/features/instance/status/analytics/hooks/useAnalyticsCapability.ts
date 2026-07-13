import type { InstanceClientIdConfig, InstanceTypeConfig } from '@/config/instanceClientConfig';
import { useQuery } from '@tanstack/react-query';

export interface AnalyticsCapability {
	supported: boolean;
	error?: Error;
	/** True when the probe failed with 401/403 — credentials, not analytics
	 *  support, are the problem, so the UI should say so. */
	isAuthError: boolean;
	isLoading: boolean;
	/** True while any probe request is in flight, including a `retry()`
	 *  refetch (during which `isLoading` stays false and `error` stays
	 *  populated) — lets the Retry button show progress. */
	isFetching: boolean;
	retry: () => void;
}

/** Capability-probe metrics tried in priority order. The probe considers
 *  `get_analytics` supported if any metric resolves without a transport
 *  error (an empty response is fine — it just means the instance is
 *  quiet). Querying a list rather than a single metric avoids a false
 *  negative on Harper builds where the chosen metric was renamed,
 *  disabled, or never emitted. Order from most-likely-emitted to least. */
const PROBE_METRICS: readonly string[] = [
	'utilization',
	'cpu-usage',
	'memory',
	'main-thread-utilization',
];

const PROBE_STALE_TIME_MS = 30 * 60_000;

function errorStatus(err: unknown): number | undefined {
	return (err as { response?: { status?: number }; status?: number })?.response?.status
		?? (err as { status?: number })?.status;
}

/** 401/403 mean the *credentials* are bad, not that a metric is missing —
 *  every other metric would fail identically, and React Query retries
 *  can't fix expired auth. */
function isAuthStatusError(err: unknown): boolean {
	const status = errorStatus(err);
	return status === 401 || status === 403;
}

/** True when the error is plausibly a "this metric isn't emitted on this
 *  build" signal (HTTP 4xx, excluding 401/403 auth failures). False when
 *  the error is transport-level (5xx, timeout, network) — those mean the
 *  *instance* is unhealthy, so walking to the next metric just compounds
 *  load on an already struggling Harper. */
function isMetricNotFoundError(err: unknown): boolean {
	const status = errorStatus(err);
	if (typeof status !== 'number') { return false; }
	return status >= 400 && status < 500 && !isAuthStatusError(err);
}

/** Probe `get_analytics` once per instance and cache the result for 30
 *  minutes. Falls through the metric list ONLY on per-metric 4xx errors
 *  (Harper version drift) — 401/403 bail immediately and set `isAuthError`
 *  since bad credentials fail every metric identically; other
 *  transport-level errors also bail so a slow / unhealthy Harper isn't hit
 *  4× per attempt. Retries up to twice
 *  with exponential backoff for transient blips (never for auth errors).
 *  The hook exposes a `retry()` function for the Retry button on the
 *  fallback view. */
export function useAnalyticsCapability(
	instanceParams: InstanceClientIdConfig & InstanceTypeConfig,
): AnalyticsCapability {
	const query = useQuery({
		queryKey: ['analytics-capability', instanceParams.entityId] as const,
		queryFn: async () => {
			const endTime = Date.now();
			const startTime = endTime - 5 * 60_000;
			let lastError: unknown = null;
			for (const metric of PROBE_METRICS) {
				try {
					await instanceParams.instanceClient.post('/', {
						operation: 'get_analytics',
						metric,
						start_time: startTime,
						end_time: endTime,
					});
					return true;
				} catch (err) {
					lastError = err;
					// Only walk the list on 4xx (metric-not-found-style).
					// 5xx / network / timeout = instance-level problem;
					// re-throw so React Query's outer retry policy decides.
					if (!isMetricNotFoundError(err)) { throw err; }
				}
			}
			throw lastError instanceof Error ? lastError : new Error('Analytics probe failed for all metrics');
		},
		// Backoff can't fix expired credentials — surface auth errors at once.
		retry: (failureCount, error) => !isAuthStatusError(error) && failureCount < 2,
		retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
		staleTime: PROBE_STALE_TIME_MS,
		gcTime: PROBE_STALE_TIME_MS,
	});

	return {
		supported: query.isSuccess === true,
		error: query.error as Error | undefined,
		isAuthError: query.error != null && isAuthStatusError(query.error),
		isLoading: query.isLoading,
		isFetching: query.isFetching,
		retry: () => {
			void query.refetch();
		},
	};
}
