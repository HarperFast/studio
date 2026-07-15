import type { InstanceClientIdConfig, InstanceTypeConfig } from '@/config/instanceClientConfig';
import { type AnalyticsCondition, getRawAnalyticsQueryOptions } from '@/integrations/api/instance/status/getAnalytics';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import type { AnalyticsDataPoint } from '../types/analytics';

export interface UseAnalyticsRecordsArgs {
	metric: string;
	startTime: number;
	endTime: number;
	conditions?: AnalyticsCondition[];
	instanceParams: InstanceClientIdConfig & InstanceTypeConfig;
	/** Required keys this metric's spec depends on. Missing keys surface via
	 *  `missingFields`, which the renderer can use to show a precise empty
	 *  state instead of a blank chart. */
	requiredFields?: readonly string[];
	/** Hint to Harper for the desired bucket size in ms. Honored when the
	 *  server supports it; otherwise it's a client-side soft cap row guard. */
	bucketMs?: number;
}

export interface UseAnalyticsRecordsResult {
	data: AnalyticsDataPoint[];
	isLoading: boolean;
	isError: boolean;
	error: Error | null;
	isEmpty: boolean;
	/** Union of keys observed across all returned rows (excluding `time` and
	 *  `node` which are part of AnalyticsDataPoint by contract). */
	fieldKeys: Set<string>;
	/** Subset of `requiredFields` that did not appear on any row. */
	missingFields: string[];
	/** True while `data` is the previous window's rows held by
	 *  `keepPreviousData` during an in-flight window change — the rows do
	 *  NOT belong to the requested [startTime, endTime]. Consumers that
	 *  pair `data` with the requested window (CSV export filenames,
	 *  previous-vs-current deltas) must gate on this. */
	isPlaceholderData: boolean;
	refetch: () => void;
}

const RESERVED = new Set(['time', 'node']);

// Stable empty array so downstream memos keyed on `data` keep referential
// identity while React Query's response is still undefined. Using a fresh `[]`
// each render churned every dependent useMemo on every render.
const EMPTY: readonly AnalyticsDataPoint[] = Object.freeze([]);

/** Adapter from studio's `get_analytics` operation to the analytics-viz spec
 *  pipeline. Passes rows through verbatim and exposes a schema-drift signal so
 *  callers can render an explicit "field unavailable" state.
 *
 *  This hook never polls: a `[startTime, endTime]` window is a fixed snapshot
 *  (it participates in the query key), so re-fetching it can only return the
 *  same range. Auto-refresh works by the caller sliding the window forward
 *  (see `StatusTabsInner`), which produces a new query key and one fresh
 *  fetch per panel; `keepPreviousData` keeps the old series on screen while
 *  the new window loads. */
export function useAnalyticsRecords({
	metric,
	startTime,
	endTime,
	conditions,
	instanceParams,
	requiredFields,
	bucketMs,
}: UseAnalyticsRecordsArgs): UseAnalyticsRecordsResult {
	const queryOpts = getRawAnalyticsQueryOptions({
		metric,
		startTime,
		endTime,
		conditions,
		instanceParams,
		bucketMs,
	});

	const query = useQuery({
		...queryOpts,
		// A fixed window's data is effectively immutable (Harper may still be
		// aggregating the newest bucket, but the next window slide re-fetches
		// it anyway), so never treat a cached window as stale — remounts and
		// tab switches within one refresh period are served from cache.
		staleTime: Infinity,
		// …but do bound retention: every window slide strands the previous
		// snapshot (up to the row cap) as an inactive cache entry, and the
		// default 5-minute gcTime would hold a rolling backlog of them on a
		// fast refresh cadence. One minute is enough for keepPreviousData to
		// bridge the swap and for quick tab flips to hit cache.
		gcTime: 60_000,
		refetchOnWindowFocus: false,
		refetchOnReconnect: false,
		placeholderData: keepPreviousData,
	});

	const data = (query.data ?? EMPTY) as AnalyticsDataPoint[];

	const { fieldKeys, missingFields } = useMemo(() => {
		const keys = new Set<string>();
		for (const row of data) {
			for (const k of Object.keys(row)) {
				if (!RESERVED.has(k)) { keys.add(k); }
			}
		}
		// Schema-drift signal requires *evidence*: at least one row that
		// carries data but lacks the required field. An empty response is
		// "no data in window" (a quiet-traffic state), not drift; flagging
		// missing fields there blanks legitimately empty panels with a
		// misleading error and was the cause of fresh-Harper false
		// positives on cpu-usage / utilization / etc.
		const missing: string[] = [];
		if (requiredFields && data.length > 0) {
			for (const f of requiredFields) {
				if (!keys.has(f)) { missing.push(f); }
			}
		}
		return { fieldKeys: keys, missingFields: missing };
	}, [data, requiredFields]);

	// Telemetry: warn only when we can be reasonably confident the empty
	// result is a schema-drift signal (caller declared required fields and at
	// least one is missing) — otherwise legitimate low-traffic windows would
	// spam the console for 5–7 panels every refresh tick.
	useEffect(() => {
		if (!query.isLoading && data.length === 0 && missingFields.length > 0) {
			console.warn('[analytics] panel rendered empty with missing fields', {
				metric,
				instanceId: instanceParams.entityId,
				missingFields,
			});
		}
	}, [data.length, query.isLoading, metric, instanceParams.entityId, missingFields]);

	return {
		data,
		isLoading: query.isLoading,
		isError: query.isError,
		error: query.error as Error | null,
		isEmpty: data.length === 0,
		fieldKeys,
		missingFields,
		isPlaceholderData: query.isPlaceholderData,
		refetch: query.refetch,
	};
}
