import { type DurationAxis, durationTicks } from '@/lib/formatValue';
import type { AxisSpec, Series, SeriesData } from '../types/analytics';
import { CEILING_KEY, type StackedRow } from './mergeStackedRows';

/** Undefined leaves the axis to the chart's own ticks. */
export function durationAxisTicks(
	axis: AxisSpec | undefined,
	series: Series[],
	onAxis: (s: Series) => boolean = () => true,
): DurationAxis | undefined {
	if (axis?.formatter !== 'ms' || axis.domain || axis.scale === 'log') { return undefined; }
	let max = 0;
	for (const s of series) {
		if (!onAxis(s)) { continue; }
		for (const { y } of s.points) {
			if (y === null || !Number.isFinite(y)) { continue; }
			if (y < 0) { return undefined; }
			if (y > max) { max = y; }
		}
	}
	return durationTicks(max);
}

/** Left and right axes of a LineChart. Thresholds draw on the left axis, so
 *  they count there: one above the data stays inside the fixed domain. */
export function lineChartDurationAxes(
	yAxis: AxisSpec | { left: AxisSpec; right?: AxisSpec } | undefined,
	data: SeriesData,
): [DurationAxis | undefined, DurationAxis | undefined] {
	const dual = !!yAxis && 'left' in yAxis;
	const thresholds: Series = {
		key: 'thresholds',
		label: 'thresholds',
		points: (data.thresholds ?? []).map((t) => ({ x: 0, y: t.value })),
	};
	return [
		durationAxisTicks(dual ? yAxis.left : yAxis, [...data.series, thresholds], (s) => s.axis !== 'right'),
		durationAxisTicks(dual ? yAxis.right : undefined, data.series, (s) => s.axis === 'right'),
	];
}

/** A stacked chart's axis is sized to the top of the stack, not one series. */
export function stackedDurationAxis(
	yAxis: AxisSpec | undefined,
	series: Series[],
	rows: StackedRow[],
): DurationAxis | undefined {
	if (yAxis?.formatter !== 'ms') { return undefined; }
	const points = rows.map((row) => ({
		x: 0,
		y: Math.max(series.reduce((sum, s) => sum + (row[s.key] ?? 0), 0), row[CEILING_KEY] ?? 0),
	}));
	return durationAxisTicks(yAxis, [{ key: 'stack', label: 'stack', points }]);
}
