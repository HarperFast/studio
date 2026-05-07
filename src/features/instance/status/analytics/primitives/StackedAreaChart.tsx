import { useMemo } from 'react';
import { Area, AreaChart, CartesianGrid, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatAxisTick, formatTooltipTime } from '../lib/time.ts';
import type { AxisFormatter, AxisSpec, SeriesData } from '../types/analytics.ts';
import { formatValue } from './formatValue.ts';
import { sortByMagnitude } from './sortByMagnitude.ts';

interface Props {
	data: SeriesData;
	theme: 'light' | 'dark';
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

interface TooltipPayloadEntry {
	dataKey: string;
	name: string;
	value: number | null;
	color: string;
}

interface StackedAreaTooltipProps {
	active?: boolean;
	payload?: readonly TooltipPayloadEntry[];
	label?: number;
	formatter?: AxisFormatter;
	unitSuffix?: string;
}

export function StackedAreaTooltip({ active, payload, label, formatter, unitSuffix }: StackedAreaTooltipProps) {
	if (!active || !payload || payload.length === 0) { return null; }
	const total = payload.reduce((s, p) => s + (typeof p.value === 'number' ? p.value : 0), 0);
	// count-si rounds at tick level; use raw 'count' for tooltip total to preserve precision.
	const totalFormatter: AxisFormatter | undefined = formatter === 'count-si' ? 'count' : formatter;
	return (
		<div style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', padding: 8 }}>
			<div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 4 }}>
				{label !== undefined ? formatTooltipTime(Number(label)) : ''}
			</div>
			{payload.map((p) => (
				<div key={p.dataKey} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
					<span style={{ color: p.color }}>{p.name}</span>
					<span>{formatValue(typeof p.value === 'number' ? p.value : 0, formatter, unitSuffix)}</span>
				</div>
			))}
			{payload.length > 1
				? (
					<div
						style={{
							display: 'flex',
							justifyContent: 'space-between',
							gap: 12,
							marginTop: 4,
							paddingTop: 4,
							borderTop: '1px solid var(--color-border)',
							fontWeight: 600,
						}}
					>
						<span>Total</span>
						<span>{formatValue(total, totalFormatter, unitSuffix)}</span>
					</div>
				)
				: null}
		</div>
	);
}

export function StackedAreaChart(
	{ data, theme, yAxis, height = 240, ariaLabel, xDomain, fillParent, lineOnly }: Props,
) {
	const sortedSeries = useMemo(() => sortByMagnitude(data.series), [data.series]);

	if (data.series.length === 0) {
		return (
			<div role="status" aria-live="polite" className="text-(--color-text-secondary) text-sm p-4">
				No data in window
			</div>
		);
	}

	const colors = ['#58a6ff', '#3fb950', '#f0883e', '#bc8cff', '#f778ba', '#79c0ff'];

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

	return (
		<div
			role="img"
			aria-label={ariaLabel ?? composeAriaLabel(data)}
			style={fillParent
				? { width: '100%', height: '100%', minHeight: 0, flex: '1 1 auto', display: 'flex', flexDirection: 'column' }
				: { width: '100%', height }}
		>
			<div aria-hidden="true" style={{ width: '100%', height: '100%' }}>
				<ResponsiveContainer width="100%" height="100%">
					<AreaChart data={merged}>
						<CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" />
						<XAxis
							dataKey="x"
							type="number"
							domain={xDomain ?? ['dataMin', 'dataMax']}
							allowDataOverflow={!!xDomain}
							tickFormatter={formatAxisTick}
							tick={{ fontSize: 11 }}
						/>
						<YAxis
							tickFormatter={(v) => formatValue(v, resolvedFormatter, resolvedUnit)}
							tick={{ fontSize: 11 }}
							width={70}
						/>
						<Tooltip content={<StackedAreaTooltip formatter={resolvedFormatter} unitSuffix={resolvedUnit} />} />
						<Legend />
						{sortedSeries.map((s, idx) => (
							<Area
								key={s.key}
								type="monotone"
								dataKey={s.key}
								name={s.label}
								stackId="1"
								stroke={s.color ?? colors[idx % colors.length]}
								strokeWidth={lineOnly ? 2 : 1}
								fill={lineOnly ? 'none' : (s.color ?? colors[idx % colors.length])}
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
									stroke="#8b949e"
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
