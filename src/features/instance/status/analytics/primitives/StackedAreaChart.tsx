import { useResolvedTheme } from '@/hooks/useResolvedTheme';
import { formatValue } from '@/lib/formatValue';
import { useMemo } from 'react';
import { Area, AreaChart, CartesianGrid, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useChartSyncProps } from '../context/AnalyticsContext';
import { NODE_PALETTE } from '../lib/nodeColors';
import { getChartColors } from '../lib/theme';
import { formatAxisTick } from '../lib/time';
import type { AxisSpec, SeriesData } from '../types/analytics';
import { ChartTooltip, useTooltipGate } from './ChartTooltip';
import { sortByMagnitude } from './sortByMagnitude';

interface Props {
	data: SeriesData;
	yAxis?: AxisSpec;
	height?: number;
	/** Optional accessible label override; otherwise composed from series labels. */
	ariaLabel?: string;
	/** Pin the x-axis to a specific [start, end] millisecond range so the
	 *  axis spans the requested window even when data is sparse. See
	 *  LineChart for the same prop. */
	xDomain?: [number, number];
	/** Fill the parent's vertical space; see LineChart for details. */
	fillParent?: boolean;
	/** Render the stack as bare lines (no filled area) so each stack
	 *  boundary reads as a distinct line. Useful for panels where bands
	 *  span widely different magnitudes — the filled-area version makes
	 *  the smaller bands hard to see, while the line version preserves
	 *  every series at its actual stacked y-position. */
	lineOnly?: boolean;
}

/** Screen-reader summary; mirrors LineChart.composeAriaLabel. */
function composeAriaLabel(data: SeriesData): string {
	const seriesNames = data.series.map((s) => s.label);
	if (seriesNames.length === 0) { return 'Empty stacked area chart'; }
	return `Stacked area chart with ${seriesNames.length} series: ${seriesNames.slice(0, 5).join(', ')}${
		seriesNames.length > 5 ? '…' : ''
	}`;
}

export function StackedAreaChart(
	{ data, yAxis, height = 240, ariaLabel, xDomain, fillParent, lineOnly }: Props,
) {
	const sortedSeries = useMemo(() => sortByMagnitude(data.series), [data.series]);
	// Fill opacity is the one genuinely theme-branched value here — dark mode
	// needs denser fills to stay legible against the dark card surface.
	const theme = useResolvedTheme();
	// Tab-scoped crosshair/tooltip sync; the expand dialog (the only
	// `fillParent` caller) gets its own scope so it never drives the panels
	// behind the overlay. See useChartSyncProps for the full rationale.
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

	const chartColors = getChartColors();

	// Merge points by x across series. Series often emit at slightly
	// staggered timestamps (e.g. Harper emits per-node records at different
	// instants within the period), so a strict equality merge produces rows
	// with one populated cell and N-1 nulls — which renders as a sparse,
	// mostly-empty stack. Forward-fill carries the last-known value across
	// staggered rows so the stack stays continuous.
	const xs = new Set<number>();
	for (const s of data.series) { for (const p of s.points) { xs.add(p.x); } }
	if (data.ceiling) { for (const p of data.ceiling.points) { xs.add(p.x); } }

	// Pre-build x → index lookup per series for O(1) access during forward-fill.
	const seriesPointMaps = data.series.map((s) => {
		const m = new Map<number, number | null>();
		for (const p of s.points) { m.set(p.x, p.y); }
		return m;
	});
	const ceilingMap = data.ceiling
		? new Map<number, number | null>(data.ceiling.points.map((p) => [p.x, p.y]))
		: null;

	const lastSeen: (number | null)[] = data.series.map(() => null);
	let lastCeiling: number | null = null;

	const merged: Record<string, number | null>[] = [...xs].sort((a, b) => a - b).map((x) => {
		const row: Record<string, number | null> = { x };
		data.series.forEach((s, i) => {
			const m = seriesPointMaps[i];
			if (m.has(x)) { lastSeen[i] = m.get(x) ?? null; }
			row[s.key] = lastSeen[i];
		});
		if (ceilingMap && data.ceiling) {
			if (ceilingMap.has(x)) { lastCeiling = ceilingMap.get(x) ?? null; }
			row.__ceiling__ = lastCeiling;
		}
		return row;
	});

	const resolvedFormatter = yAxis?.formatter;
	const resolvedUnit = yAxis?.unit;
	const fillOpacity = theme === 'dark' ? 0.5 : 0.35;

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
			<div aria-hidden="true" style={{ width: '100%', height: '100%' }}>
				<ResponsiveContainer width="100%" height="100%">
					<AreaChart data={merged} {...syncProps}>
						<CartesianGrid stroke={chartColors.gridColor} strokeDasharray="3 3" />
						<XAxis
							dataKey="x"
							type="number"
							domain={xDomain ?? ['dataMin', 'dataMax']}
							allowDataOverflow={!!xDomain}
							tickFormatter={formatAxisTick}
							stroke={chartColors.axisColor}
							tick={{ fontSize: 11 }}
						/>
						<YAxis
							tickFormatter={(v) => formatValue(v, resolvedFormatter, resolvedUnit)}
							stroke={chartColors.axisColor}
							tick={{ fontSize: 11 }}
							width={70}
						/>
						<Tooltip
							// No enter/move easing: with syncId every synced chart
							// animates on each mouse-move, making the tab visibly jerk.
							isAnimationActive={false}
							content={
								<ChartTooltip
									hidden={!hovered}
									formatter={resolvedFormatter}
									unitSuffix={resolvedUnit}
									nodeNames={nodeNames}
									showTotal
								/>
							}
						/>
						<Legend />
						{sortedSeries.map((s, idx) => (
							<Area
								key={s.key}
								type="monotone"
								dataKey={s.key}
								name={s.label}
								stackId="1"
								stroke={s.color ?? NODE_PALETTE[idx % NODE_PALETTE.length]}
								strokeWidth={lineOnly ? 2 : 1}
								fill={lineOnly ? 'none' : (s.color ?? NODE_PALETTE[idx % NODE_PALETTE.length])}
								fillOpacity={lineOnly ? 0 : fillOpacity}
								connectNulls={false}
							/>
						))}
						{data.ceiling
							? (
								<Line
									type="monotone"
									dataKey="__ceiling__"
									name={data.ceiling.label}
									stroke={chartColors.axisColor}
									strokeWidth={2}
									strokeDasharray="6 3"
									dot={false}
								/>
							)
							: null}
					</AreaChart>
				</ResponsiveContainer>
			</div>
		</div>
	);
}
