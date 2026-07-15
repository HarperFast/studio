import { formatValue, type ValueFormatter } from '@/lib/formatValue';
import { useMemo } from 'react';
import { shortNodeLabelMap } from '../lib/nodeLabels';
import { formatTooltipTime } from '../lib/time';
import { tooltipContentStyle, tooltipItemStyle, tooltipLabelStyle } from './tooltipStyle';

/** The subset of Recharts' tooltip payload entry the shared content reads.
 *  Kept structural (not Recharts' own type) so the component stays trivially
 *  testable and independent of Recharts' generics. */
export interface ChartTooltipEntry {
	dataKey?: string | number;
	name?: string | number;
	value?: number | string | Array<number | string> | null;
	color?: string;
}

export interface ChartTooltipEntryFormat {
	formatter?: ValueFormatter;
	unitSuffix?: string;
}

interface Props {
	/** Injected by Recharts when passed as <Tooltip content={...}>. */
	active?: boolean;
	payload?: readonly ChartTooltipEntry[];
	label?: number | string;
	/** Default value format applied to every row. */
	formatter?: ValueFormatter;
	unitSuffix?: string;
	/** Per-entry format override for dual-axis charts (LineChart resolves the
	 *  entry's series to its left/right axis spec). Wins over
	 *  `formatter`/`unitSuffix` when provided. */
	resolveEntryFormat?: (entry: ChartTooltipEntry) => ChartTooltipEntryFormat;
	/** Full node FQDNs present on the chart. Occurrences inside displayed
	 *  series names are shortened (collision-aware, see shortNodeLabelMap).
	 *  Display-layer only: the series `label` fields are untouched, so CSV
	 *  exports and legends keep the full names. */
	nodeNames?: readonly string[];
	/** Append the stacked charts' summed Total row (ported from the old
	 *  StackedAreaTooltip; hidden for single-entry payloads). */
	showTotal?: boolean;
}

/** THE tooltip content for every synced cartesian chart on the Status tabs
 *  (LineChart, StackedAreaChart, TableSizeTrend). One implementation so the
 *  time header, node-name shortening, and value formatting can't drift
 *  between chart types. */
export function ChartTooltip(
	{ active, payload, label, formatter, unitSuffix, resolveEntryFormat, nodeNames, showTotal }: Props,
) {
	const shortLabels = useMemo(() => {
		const map = shortNodeLabelMap(nodeNames ?? []);
		// Longest-first so a node name that contains another node's full name
		// as a substring can't be half-replaced by the shorter match.
		const fullNames = [...map.keys()].sort((a, b) => b.length - a.length);
		return { map, fullNames };
	}, [nodeNames]);

	if (!active || !payload || payload.length === 0) { return null; }

	const displayName = (raw: string): string => {
		let out = raw;
		for (const full of shortLabels.fullNames) {
			const short = shortLabels.map.get(full)!;
			if (short !== full && out.includes(full)) { out = out.split(full).join(short); }
		}
		return out;
	};

	const entryFormat = (entry: ChartTooltipEntry): ChartTooltipEntryFormat =>
		resolveEntryFormat?.(entry) ?? { formatter, unitSuffix };

	const numericValues = payload.map((p) => (typeof p.value === 'number' ? p.value : null));
	const total = numericValues.reduce<number>((s, v) => s + (v ?? 0), 0);
	// count-si rounds at tick level; use raw 'count' for the Total so the sum
	// keeps its precision (ported from StackedAreaTooltip).
	const totalFormatter: ValueFormatter | undefined = formatter === 'count-si' ? 'count' : formatter;

	return (
		<div style={tooltipContentStyle}>
			<div style={tooltipLabelStyle}>
				{label !== undefined ? formatTooltipTime(Number(label)) : ''}
			</div>
			{payload.map((p, i) => {
				const fmt = entryFormat(p);
				return (
					<div
						key={`${String(p.dataKey ?? '')}-${String(p.name ?? i)}`}
						style={{ ...tooltipItemStyle, display: 'flex', justifyContent: 'space-between', gap: 12 }}
					>
						<span style={{ color: p.color }}>{displayName(String(p.name ?? p.dataKey ?? ''))}</span>
						<span>{formatValue(numericValues[i], fmt.formatter, fmt.unitSuffix)}</span>
					</div>
				);
			})}
			{showTotal && payload.length > 1
				? (
					<div
						style={{
							display: 'flex',
							justifyContent: 'space-between',
							gap: 12,
							marginTop: 4,
							paddingTop: 4,
							borderTop: '1px solid var(--border)',
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
