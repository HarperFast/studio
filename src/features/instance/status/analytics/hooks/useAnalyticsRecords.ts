import type { InstanceClientIdConfig, InstanceTypeConfig } from '@/config/instanceClientConfig.ts';
import {
	type AnalyticsCondition,
	getRawAnalyticsQueryOptions,
} from '@/integrations/api/instance/status/getAnalytics.ts';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef } from 'react';
import type { AnalyticsDataPoint } from '../types/analytics.ts';

export interface UseAnalyticsRecordsArgs {
	metric: string;
	startTime: number;
	endTime: number;
	conditions?: AnalyticsCondition[];
	instanceParams: InstanceClientIdConfig & InstanceTypeConfig;
	/** Polling cadence in ms. Set to 0 to disable. */
	refetchIntervalMs?: number;
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
	refetch: () => void;
}

const RESERVED = new Set(['time', 'node']);

/** Adapter from studio's `get_analytics` operation to the analytics-viz spec
 *  pipeline. Passes rows through verbatim, exposes a schema-drift signal so
 *  callers can render an explicit "field unavailable" state, and applies
 *  small jitter to the polling start time so a tab's many concurrent specs
 *  do not fire in lockstep on every refresh tick. */
export function useAnalyticsRecords({
	metric,
	startTime,
	endTime,
	conditions,
	instanceParams,
	refetchIntervalMs = 60_000,
	requiredFields,
	bucketMs,
}: UseAnalyticsRecordsArgs): UseAnalyticsRecordsResult {
	// Per-spec startup jitter (0–500 ms) so 5–7 concurrent specs in one tab
	// do not refire in the same render frame on auto-refresh.
	const jitterRef = useRef<number | null>(null);
	if (jitterRef.current === null) {
		jitterRef.current = Math.floor(Math.random() * 500);
	}

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
		staleTime: refetchIntervalMs > 0 ? refetchIntervalMs : Infinity,
		refetchInterval: refetchIntervalMs > 0 ? refetchIntervalMs + jitterRef.current : false,
		refetchOnWindowFocus: false,
		refetchOnReconnect: false,
		placeholderData: keepPreviousData,
	});

	// React Query already pauses interval refetching when the tab is hidden;
	// we don't add a visibility-driven refetch ourselves because that turns
	// every alt-tab into a synchronized N-panel POST burst on the customer's
	// Harper, bypassing staleTime entirely.

	const data = query.data ?? [];

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
		refetch: query.refetch,
	};
}
