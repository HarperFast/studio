import type { InstanceClientIdConfig, InstanceTypeConfig } from '@/config/instanceClientConfig.ts';
import { useQuery } from '@tanstack/react-query';

export interface AnalyticsCapability {
	supported: boolean;
	error?: Error;
	isLoading: boolean;
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

/** True when the error is plausibly a "this metric isn't emitted on this
 *  build" signal (HTTP 4xx). False when the error is transport-level
 *  (5xx, timeout, network) — those mean the *instance* is unhealthy, so
 *  walking to the next metric just compounds load on an already
 *  struggling Harper. */
function isMetricNotFoundError(err: unknown): boolean {
	const status = (err as { response?: { status?: number }; status?: number })?.response?.status
		?? (err as { status?: number })?.status;
	if (typeof status !== 'number') { return false; }
	return status >= 400 && status < 500;
}

/** Probe `get_analytics` once per instance and cache the result for 30
 *  minutes. Falls through the metric list ONLY on per-metric 4xx errors
 *  (Harper version drift); bails immediately on transport-level errors so
 *  a slow / unhealthy Harper isn't hit 4× per attempt. Retries up to twice
 *  with exponential backoff for transient blips. The hook exposes a
 *  `retry()` function for a Retry button on the fallback view. */
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
		retry: 2,
		retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
		staleTime: PROBE_STALE_TIME_MS,
		gcTime: PROBE_STALE_TIME_MS,
	});

	return {
		supported: query.isSuccess === true,
		error: query.error as Error | undefined,
		isLoading: query.isLoading,
		retry: () => {
			void query.refetch();
		},
	};
}
