import { useMemo, useRef } from 'react';
import { useAnalyticsContext } from '../../context/AnalyticsContext';
import { useAnalyticsRecords } from '../../hooks/useAnalyticsRecords';
import { runPipeline } from '../../pipeline/pipeline';
import type { TimeRange } from '../../types/analytics';
import { collapseSeries, computeDelta, type KpiDelta, type KpiPoint, latestValue, windowMean } from './kpiMath';
import type { KpiTileDef } from './kpiTiles';

export interface KpiTileData {
	/** Latest-bucket cluster value; null when the window has no data (the
	 *  tile renders an em-dash and no delta). */
	latest: number | null;
	/** Current-window mean vs previous-window mean; null while the previous
	 *  window is loading, errored, empty, or the ratio is undefined. Only
	 *  recomputed when BOTH windows hold settled (non-placeholder) data —
	 *  while a window slide is in flight the last settled delta is held, so
	 *  a mismatched current/previous pair never flips the arrow. */
	delta: KpiDelta | null;
	/** Collapsed current-window points feeding the sparkline. */
	sparkPoints: KpiPoint[];
	/** Current-window fetch in flight — the tile shows its skeleton. */
	isLoading: boolean;
	timeRange: TimeRange;
	windowMs: number;
}

/** Data for one KPI tile: the current window plus the previous window of
 *  equal length, each through the shared spec pipeline.
 *
 *  Query accounting (#1457), per refresh tick while Health is shown: the
 *  current-window call passes exactly the arguments MetricPanel passes
 *  (same metric string, same context timeRange/bucketMs, no conditions), so
 *  it lands on the panels' query key — deduped for the three metrics whose
 *  panels are mounted on Health (cpu-usage, memory,
 *  main-thread-utilization), but a real POST for success and duration,
 *  whose panels live on the (unmounted) Requests tab; those fetches seed
 *  the cache for a Requests visit. The previous-window keys are quantized
 *  to the bucket grid below, so they only re-fetch (5 POSTs) when the
 *  sliding window crosses a bucket boundary — consecutive ticks within one
 *  bucket hit the staleTime-Infinity cache. Every key shares
 *  ANALYTICS_QUERY_KEY_PREFIX + instanceId, so StatusTabs' in-flight
 *  refresh guard covers them all. */
export function useKpiTileData(def: KpiTileDef): KpiTileData {
	const { timeRange, bucketMs, instanceParams } = useAnalyticsContext();
	const windowMs = timeRange.endTime - timeRange.startTime;
	// The previous window is historical, so its exact boundaries are
	// cosmetic — quantize them to the bucket grid so every tick within one
	// bucket produces the same query key (a cache hit, not a POST). The
	// current window must NOT be quantized: its args must stay byte-identical
	// to MetricPanel's for the key to coincide.
	const prevEnd = Math.floor(timeRange.startTime / bucketMs) * bucketMs;
	const prevStart = prevEnd - windowMs;

	const current = useAnalyticsRecords({
		metric: def.metric,
		startTime: timeRange.startTime,
		endTime: timeRange.endTime,
		instanceParams,
		bucketMs,
	});
	const previous = useAnalyticsRecords({
		metric: def.metric,
		startTime: prevStart,
		endTime: prevEnd,
		instanceParams,
		bucketMs,
	});

	const sparkPoints = useMemo<KpiPoint[]>(() => {
		if (current.isError) { return []; }
		// No `downsampleToWindow` here, unlike the chart panels: these points
		// collapse to a headline number and a sparkline, so there is no density
		// to save, and folding onto a coarse lattice first would redefine
		// `latestValue` from "the newest bucket" to "an average across the
		// newest coarse bucket".
		return collapseSeries(
			runPipeline(def.spec, current.data, timeRange, [], { snapToPeriod: true }),
			def.combine,
			def.includeDims,
		);
	}, [def, current.data, current.isError, timeRange]);

	const previousMean = useMemo<number | null>(() => {
		if (previous.isLoading || previous.isError) { return null; }
		const prevRange: TimeRange = { startTime: prevStart, endTime: prevEnd };
		// Full resolution, matching sparkPoints above — the delta compares two
		// window means and both sides must be computed the same way.
		return windowMean(collapseSeries(
			runPipeline(def.spec, previous.data, prevRange, [], { snapToPeriod: true }),
			def.combine,
			def.includeDims,
		));
	}, [def, previous.data, previous.isLoading, previous.isError, prevStart, prevEnd]);

	// keepPreviousData keeps isLoading false while `data` still holds the
	// OLDER window's rows during a window slide, so a delta computed then
	// would pair mismatched windows (one side settles before the other) and
	// flip the arrow through a bogus near-zero reading. Only compute a fresh
	// delta from a settled pair; hold the last one otherwise.
	const lastSettledDelta = useRef<KpiDelta | null>(null);
	let delta: KpiDelta | null;
	if (current.isPlaceholderData || previous.isPlaceholderData) {
		delta = lastSettledDelta.current;
	} else {
		delta = computeDelta(windowMean(sparkPoints), previousMean);
		lastSettledDelta.current = delta;
	}

	return {
		latest: latestValue(sparkPoints),
		delta,
		sparkPoints,
		isLoading: current.isLoading,
		timeRange,
		windowMs,
	};
}
