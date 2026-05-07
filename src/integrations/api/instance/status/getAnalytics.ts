import type { InstanceClientIdConfig, InstanceTypeConfig } from '@/config/instanceClientConfig.ts';
import type { AnalyticsDataPoint } from '@/features/instance/status/analytics/types/analytics.ts';
import type { Units } from '@/lib/units';
import { queryOptions } from '@tanstack/react-query';

export type MetricDataKey = string | ((metric: Metric) => number);
export type MetricUnits = Units | 'reads' | 'writes' | 'messages';
export interface MetricConfig {
	id: string;
	name: string;
	label?: string;
	dataKey: MetricDataKey;
	aggregator: (accumulator: number, current: number) => number;
	units: MetricUnits;
	path?: string;
}

interface GetAnalyticsParams {
	metricConfig: MetricConfig;
	startTime: number;
	endTime: number;
	instanceParams: InstanceClientIdConfig & InstanceTypeConfig;
}

interface GetAnalyticsRequest {
	operation: 'get_analytics';
	metric: string;
	start_time: number;
	end_time: number;
	conditions?: {
		attribute: string;
		value: string | number | boolean;
		comparator?: string;
	}[];
}

export interface Metric {
	id: number;
	metric: string;
	count: number;
	mean: number;
	period: number;
	node: string;
	[key: string]: string | number | boolean | null;
}

type GetAnalyticsResponse = Metric[];

export function getAnalyticsQueryOptions({ metricConfig, startTime, endTime, instanceParams }: GetAnalyticsParams) {
	return queryOptions({
		queryKey: ['get_analytics', metricConfig.name, metricConfig.path, startTime, endTime] as const,
		queryFn: async () => {
			const req: GetAnalyticsRequest = {
				operation: 'get_analytics',
				metric: metricConfig.name,
				start_time: startTime,
				end_time: endTime,
			};
			if (metricConfig.path) {
				req.conditions = [{ attribute: 'path', value: metricConfig.path }];
			}
			const { data } = await instanceParams.instanceClient.post<GetAnalyticsResponse>('/', req);
			return data;
		},
	});
}

// ─────────────────────────────────────────────────────────────────────────────
// New analytics path — feeds the analytics-viz spec pipeline.
//
// Returns rows verbatim (typed as AnalyticsDataPoint) so each spec's own
// `timestamp:` field decides which column drives the x-axis, instead of the
// adapter pre-collapsing `id` and `time`.
//
// Query key is instance-scoped so cross-instance studio tabs do not collide
// in React Query's cache.
// ─────────────────────────────────────────────────────────────────────────────

export interface AnalyticsCondition {
	attribute: string;
	value: string | number | boolean;
	comparator?: string;
}

interface GetRawAnalyticsRequest extends GetAnalyticsRequest {
	/** Bucket size hint in milliseconds. Honored by Harper builds that
	 *  support server-side downsampling; older builds ignore the field and
	 *  return full-resolution rows (the client-side row guard below is the
	 *  fallback). */
	bucket_ms?: number;
}

interface GetRawAnalyticsParams {
	metric: string;
	startTime: number;
	endTime: number;
	conditions?: AnalyticsCondition[];
	instanceParams: InstanceClientIdConfig & InstanceTypeConfig;
	bucketMs?: number;
}

/** Worst-case row payload before we cap. With 5 nodes × 50 tables × 30d × 1m
 *  buckets we'd exceed this in seconds. The cap is a defensive truncation —
 *  the user sees a banner explaining that the window was widened past the
 *  server's downsampling capability. */
const MAX_ROWS = 50_000;

/** Distinct query-key prefix used by the analytics-viz spec pipeline. Kept
 *  separate from the legacy `getAnalyticsQueryOptions` prefix so:
 *   - cache hits never alias across the two paths
 *   - cache subscriptions (e.g. useAnalyticsFreshness) can scope to one path
 */
export const ANALYTICS_QUERY_KEY_PREFIX = 'get_analytics_raw' as const;

export function getRawAnalyticsQueryOptions({
	metric,
	startTime,
	endTime,
	conditions,
	instanceParams,
	bucketMs,
}: GetRawAnalyticsParams) {
	const instanceId = instanceParams.entityId;
	return queryOptions({
		queryKey: [
			ANALYTICS_QUERY_KEY_PREFIX,
			instanceId,
			metric,
			startTime,
			endTime,
			bucketMs ?? null,
			conditions ?? null,
		] as const,
		queryFn: async () => {
			const req: GetRawAnalyticsRequest = {
				operation: 'get_analytics',
				metric,
				start_time: startTime,
				end_time: endTime,
			};
			if (conditions && conditions.length > 0) {
				req.conditions = conditions;
			}
			if (bucketMs && bucketMs > 0) {
				req.bucket_ms = bucketMs;
			}
			const { data } = await instanceParams.instanceClient.post<AnalyticsDataPoint[]>('/', req);
			if (data.length > MAX_ROWS) {
				// Tail-keep: Harper returns ascending-time, so trimming the head
				// preserves the most-recent buckets the user actually cares
				// about and drops the oldest. Head-keep would silently lose
				// "now" and look like a data outage at the right edge.
				console.warn('[analytics] response exceeded row cap; truncating oldest', {
					metric,
					rows: data.length,
					cap: MAX_ROWS,
					dropped: data.length - MAX_ROWS,
				});
				return data.slice(-MAX_ROWS);
			}
			return data;
		},
	});
}
