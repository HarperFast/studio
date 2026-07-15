import { formatValue } from '@/lib/formatValue';
import {
	CartesianGrid,
	Legend,
	Line,
	LineChart as RLineChart,
	ReferenceLine,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from 'recharts';
import { useChartSyncProps } from '../context/AnalyticsContext';
import { NODE_PALETTE } from '../lib/nodeColors';
import { getChartColors } from '../lib/theme';
import { formatAxisTick } from '../lib/time';
import type { AxisSpec, SeriesData, Threshold } from '../types/analytics';
import { ChartTooltip, type ChartTooltipEntry, useTooltipGate } from './ChartTooltip';

interface Props {
	data: SeriesData;
	yAxis?: AxisSpec | { left: AxisSpec; right?: AxisSpec };
	height?: number;
	/** Optional accessible label override; otherwise composed from series labels. */
	ariaLabel?: string;
	/** Suppress the in-chart Recharts <Legend>. Used by parents (e.g.
	 *  SmallMultiples) that render a shared legend so per-chart legends
	 *  don't crowd out the plot area in small panels. */
	hideLegend?: boolean;
	/** Pin the x-axis to a specific [start, end] millisecond range. When
	 *  set, the axis spans the requested window even if the data is sparse
	 *  inside it — operators expect "Last 7 days" to actually show 7 days
	 *  of axis, with the data appearing as a chunk at the right edge. When
	 *  omitted, the axis falls back to dataMin/dataMax of the points. */
	xDomain?: [number, number];
	/** When true, the chart fills its parent's vertical space instead of
	 *  using the fixed `height` prop. Used by the expand-to-fullscreen
	 *  dialog so the chart actually grows to fit; the parent must be a
	 *  flex column with a definite height (e.g. h-[90vh]) for this to
	 *  resolve to a real pixel size. */
	fillParent?: boolean;
}

type DualAxis = { left: AxisSpec; right?: AxisSpec };

function isDualAxis(a: Props['yAxis']): a is DualAxis {
	return !!a && typeof a === 'object' && 'left' in a;
}

/** Builds a screen-reader-readable summary of the chart contents.
 *  Recharts itself emits no a11y semantics — this gives an `<svg>`-equivalent
 *  one-shot description so AT users get *something* without a data-table
 *  fallback. Better than silent. */
function composeAriaLabel(data: SeriesData): string {
	const seriesNames = data.series.map((s) => s.label);
	const summary = seriesNames.length === 1
		? `Chart of ${seriesNames[0]}`
		: `Chart with ${seriesNames.length} series: ${seriesNames.slice(0, 5).join(', ')}${
			seriesNames.length > 5 ? '…' : ''
		}`;
	const thresholdNote = data.thresholds && data.thresholds.length > 0
		? `. ${data.thresholds.length} threshold${data.thresholds.length === 1 ? '' : 's'}.`
		: '';
	return `${summary}${thresholdNote}`;
}

export function LineChart(
	{ data, yAxis, height = 240, ariaLabel, hideLegend, xDomain, fillParent }: Props,
) {
	// Sync crosshairs/tooltips across every cartesian chart on the current
	// Status tab. `fillParent` is only ever set by the expand-to-fullscreen
	// dialog (ChartExpandButton), which gets its own sync scope — see
	// useChartSyncProps for the full rationale.
	const syncProps = useChartSyncProps(!!fillParent);
	// Tooltip box only on the chart under the pointer — synced siblings keep
	// the cursor line but render no box (see useTooltipGate/ChartTooltip).
	const { hovered, gateProps } = useTooltipGate();

	if (data.series.length === 0) {
		return (
			<div role="status" aria-live="polite" className="text-(--color-text-secondary) text-sm p-4">
				No data in window
			</div>
		);
	}

	// Flatten points across series for Recharts' data prop.
	// We render one <Line> per series, each with its own `data` prop so axes
	// aren't forced to share an X domain per row.
	const isDual = isDualAxis(yAxis);
	const leftAxis = isDual ? yAxis.left : (yAxis as AxisSpec | undefined);
	const rightAxis = isDual ? yAxis.right : undefined;

	const chartColors = getChartColors();

	// Full node FQDNs on this chart — the shared tooltip shortens them in
	// displayed series names (display-layer only; `label` stays untouched).
	const nodeNames = [...new Set(data.series.flatMap((s) => (s.node !== undefined ? [s.node] : [])))];

	return (
		<div
			role="img"
			aria-label={ariaLabel ?? composeAriaLabel(data)}
			style={fillParent
				? { width: '100%', height: '100%', minHeight: 0, flex: '1 1 auto', display: 'flex', flexDirection: 'column' }
				: { width: '100%', height }}
			{...gateProps}
		>
			{
				/* Inner SVG is decorative once the outer role=img has the
			    composed label — Safari/VO otherwise descends and reads
			    every <g>/<path> text fragment. */
			}
			<div aria-hidden="true" style={{ width: '100%', height: '100%' }}>
				<ResponsiveContainer width="100%" height="100%">
					<RLineChart margin={{ top: 12, right: 12, bottom: 8, left: 8 }} {...syncProps}>
						<CartesianGrid stroke={chartColors.gridColor} strokeDasharray="3 3" />
						<XAxis
							dataKey="x"
							type="number"
							domain={xDomain ?? ['dataMin', 'dataMax']}
							allowDataOverflow={!!xDomain}
							allowDuplicatedCategory={false}
							tickFormatter={formatAxisTick}
							stroke={chartColors.axisColor}
							tick={{ fontSize: 11 }}
						/>
						<YAxis
							yAxisId="left"
							tickFormatter={(v) => formatValue(v, leftAxis?.formatter, leftAxis?.unit)}
							scale={leftAxis?.scale ?? 'linear'}
							domain={leftAxis?.domain as [number | string, number | string] | undefined}
							stroke={chartColors.axisColor}
							tick={{ fontSize: 11 }}
							// Wider than Recharts' ~60px default so e.g. '2400.0 ms'
							// or '1.5 GB' doesn't wrap onto two lines per tick.
							width={70}
						/>
						{isDual && rightAxis
							? (
								<YAxis
									yAxisId="right"
									orientation="right"
									tickFormatter={(v) => formatValue(v, rightAxis.formatter, rightAxis.unit)}
									scale={rightAxis.scale ?? 'linear'}
									domain={rightAxis.domain as [number | string, number | string] | undefined}
									stroke={chartColors.axisColor}
									tick={{ fontSize: 11 }}
									width={70}
								/>
							)
							: null}
						<Tooltip
							// No enter/move easing: with syncId every synced chart
							// animates on each mouse-move, making the tab visibly jerk.
							isAnimationActive={false}
							content={
								<ChartTooltip
									hidden={!hovered}
									nodeNames={nodeNames}
									resolveEntryFormat={(entry: ChartTooltipEntry) => {
										const nameStr = String(entry.name ?? '');
										const series = data.series.find((s) => s.label === nameStr || s.key === nameStr);
										const axisSpec = series?.axis === 'right' ? rightAxis : leftAxis;
										return { formatter: axisSpec?.formatter, unitSuffix: axisSpec?.unit };
									}}
								/>
							}
						/>
						{!hideLegend && <Legend />}
						{data.thresholds?.map((t: Threshold, i: number) => {
							// Compose a label that carries value + direction so the
							// reference line is self-describing instead of relying on
							// stroke-color alone (fails WCAG 1.4.1 use-of-color).
							const formatted = formatValue(t.value, leftAxis?.formatter, leftAxis?.unit);
							const directionMark = t.direction === 'above-is-bad' ? '↑ bad' : '↓ bad';
							const labelText = `${t.label} (${formatted}, ${directionMark})`;
							// Alternate label position so multiple thresholds (e.g.
							// connection's connect+disconnect pair) don't stack on top
							// of each other at the same corner.
							const position = i % 2 === 0 ? 'insideTopRight' : 'insideBottomRight';
							return (
								<ReferenceLine
									key={`th-${i}`}
									yAxisId="left"
									y={t.value}
									stroke={t.direction === 'above-is-bad' ? 'var(--color-error)' : 'var(--color-success)'}
									strokeDasharray="4 2"
									label={{ value: labelText, position, fontSize: 11 }}
								/>
							);
						})}
						{data.series.map((s, idx) => {
							// Per-node mode often produces series with 1-2 points
							// (sparse data, short window). Recharts won't draw a
							// line with a single point, so force a small dot when
							// the series is sparse — otherwise the chart looks
							// blank even though data is present.
							const showDots = s.points.length <= 5;
							return (
								<Line
									key={s.key}
									data={s.points}
									type="monotone"
									dataKey="y"
									name={s.label}
									yAxisId={s.axis === 'right' ? 'right' : 'left'}
									stroke={s.color ?? NODE_PALETTE[idx % NODE_PALETTE.length]}
									strokeWidth={2}
									strokeOpacity={s.opacity ?? 1}
									dot={showDots ? { r: 2 } : false}
									connectNulls={false}
								/>
							);
						})}
					</RLineChart>
				</ResponsiveContainer>
			</div>
		</div>
	);
}
