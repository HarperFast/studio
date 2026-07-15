import { formatValue, type ValueFormatter } from '@/lib/formatValue';
import { useMemo, useState } from 'react';
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
	/** Render nothing even while Recharts reports `active` — set by charts in
	 *  a crosshair-sync group that are NOT under the pointer (useTooltipGate).
	 *  Recharts still draws the Tooltip `cursor` line when the content renders
	 *  null, so non-hovered synced charts keep the crosshair without stacking
	 *  a screenful of tooltip boxes. */
	hidden?: boolean;
}

export interface TooltipGateProps {
	onMouseEnter: () => void;
	onMouseLeave: () => void;
	onTouchStart: () => void;
	onFocus: () => void;
	onBlur: () => void;
}

/** Per-chart hover gate for synced tooltips: spread `gateProps` on the chart's
 *  container and pass `hidden={!hovered}` to <ChartTooltip>. With Recharts'
 *  syncId every synced chart activates its own full tooltip; this keeps the
 *  box on the chart being interacted with while the others retain the synced
 *  cursor.
 *
 *  Non-mouse input opens the gate too — Recharts activates tooltips from
 *  touch events and (via its accessibility layer) from arrow keys on a
 *  focused chart, so gating on mouse hover alone would blank tooltips for
 *  those users entirely. Touch has no "leave", so the gate stays open until
 *  the next mouse/focus interaction closes it — after tapping two synced
 *  charts both may show a box, which simply matches pre-gate behavior. */
export function useTooltipGate(): {
	hovered: boolean;
	gateProps: TooltipGateProps;
} {
	const [hovered, setHovered] = useState(false);
	const gateProps = useMemo(() => {
		const open = () => setHovered(true);
		const close = () => setHovered(false);
		return {
			onMouseEnter: open,
			onMouseLeave: close,
			onTouchStart: open,
			// React's onFocus/onBlur map to focusin/focusout, so focus moving
			// anywhere inside the chart container keeps the gate open.
			onFocus: open,
			onBlur: close,
		};
	}, []);
	return { hovered, gateProps };
}

/** THE tooltip content for every synced cartesian chart on the Status tabs
 *  (LineChart, StackedAreaChart, TableSizeTrend). One implementation so the
 *  time header, node-name shortening, and value formatting can't drift
 *  between chart types. */
export function ChartTooltip(
	{ active, payload, label, formatter, unitSuffix, resolveEntryFormat, nodeNames, showTotal, hidden }: Props,
) {
	const shortLabels = useMemo(() => {
		const map = shortNodeLabelMap(nodeNames ?? []);
		// Longest-first so a node name that contains another node's full name
		// as a substring can't be half-replaced by the shorter match.
		const fullNames = [...map.keys()].sort((a, b) => b.length - a.length);
		return { map, fullNames };
	}, [nodeNames]);

	if (hidden || !active || !payload || payload.length === 0) { return null; }

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
