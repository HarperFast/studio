import { useMemo } from 'react';
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
	 *  window is loading, errored, empty, or the ratio is undefined. */
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
 *  Query accounting — the strip's dedupe contract (#1457): the
 *  current-window call passes exactly the arguments MetricPanel passes
 *  (same metric string, same context timeRange/bucketMs, no conditions), so
 *  it lands on the panels' existing query key and react-query serves both
 *  from one POST. The previous-window call is the only new key — at most
 *  one extra POST per metric per window slide. Its key shares
 *  ANALYTICS_QUERY_KEY_PREFIX + instanceId, so StatusTabs' in-flight
 *  refresh guard covers it too. */
export function useKpiTileData(def: KpiTileDef): KpiTileData {
	const { timeRange, bucketMs, instanceParams } = useAnalyticsContext();
	const windowMs = timeRange.endTime - timeRange.startTime;

	const current = useAnalyticsRecords({
		metric: def.metric,
		startTime: timeRange.startTime,
		endTime: timeRange.endTime,
		instanceParams,
		bucketMs,
	});
	const previous = useAnalyticsRecords({
		metric: def.metric,
		startTime: timeRange.startTime - windowMs,
		endTime: timeRange.startTime,
		instanceParams,
		bucketMs,
	});

	const sparkPoints = useMemo<KpiPoint[]>(() => {
		if (current.isError) { return []; }
		return collapseSeries(
			runPipeline(def.spec, current.data, timeRange, [], { snapToPeriod: true }),
			def.combine,
		);
	}, [def, current.data, current.isError, timeRange]);

	const previousMean = useMemo<number | null>(() => {
		if (previous.isLoading || previous.isError) { return null; }
		const prevRange: TimeRange = {
			startTime: timeRange.startTime - windowMs,
			endTime: timeRange.startTime,
		};
		return windowMean(collapseSeries(
			runPipeline(def.spec, previous.data, prevRange, [], { snapToPeriod: true }),
			def.combine,
		));
	}, [def, previous.data, previous.isLoading, previous.isError, timeRange.startTime, windowMs]);

	return {
		latest: latestValue(sparkPoints),
		delta: computeDelta(windowMean(sparkPoints), previousMean),
		sparkPoints,
		isLoading: current.isLoading,
		timeRange,
		windowMs,
	};
}
