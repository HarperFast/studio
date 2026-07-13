import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useNodeSelection } from '../hooks/useNodeSelection.ts';
import { getTableColor, OTHER_COLOR } from '../lib/tableColors.ts';
import { OTHER_KEY, type Snapshot } from '../lib/tableSize.ts';
import { getChartColors, type Theme } from '../lib/theme.ts';
import { formatValue } from '../primitives/formatValue.ts';
import { tooltipContentStyle, tooltipItemStyle, tooltipLabelStyle } from '../primitives/tooltipStyle.ts';
import type { ViewMode } from '../types/analytics.ts';
import { NodeLegend } from './NodeLegend.tsx';
import { TableSizeChipRow } from './TableSizeChipRow.tsx';

/** One byte-format path for every chart — see primitives/formatValue.ts. */
const formatBytes = (bytes: number) => formatValue(bytes, 'bytes-si');

interface Props {
	snapshot: Snapshot;
	/** Display mode: 'per-node' → Absolute (raw bytes), 'aggregate' → Normalized (percent of cluster max). */
	viewMode: ViewMode;
	/** @deprecated Ignored — theming resolves via `--chart-*` CSS tokens.
	 *  Kept optional only while StorageTab (owned by a parallel refactor)
	 *  still passes it. */
	theme?: Theme;
	/** Snapshot's own highlight — drives chip `aria-checked` + bar-segment outline. */
	selectedTable: string | null;
	/** Chip click / Enter / Space / arrow-nav — local to this panel; should NOT
	 *  drive Trend. */
	onChipSelect: (tableKey: string) => void;
	/** Bar-segment click — drilldown signal: should drive both this panel's
	 *  highlight AND the Trend panel's selection. */
	onBarClick: (tableKey: string) => void;
	/** Rendered inline when `emptyCause === 'all-other'`. */
	allOtherHint?: boolean;
}

interface Row {
	node: string;
	__total__: number;
	/** Aliased values keyed by `t_<idx>` (matching `stackKeys` index) so Recharts'
	 *  string `dataKey` lookup works — table names like `data.events` would
	 *  otherwise be split as object paths. */
	[aliasKey: string]: number | string;
}

/**
 * Both modes produce the same row shape: stacks carry absolute bytes, with
 * `__total__` tracking the node's cross-all-tables total. The mode only
 * changes how the y-axis renders those bytes. This is what gives Normalized
 * its "visible gap" behavior: a node missing a top-N table has a shorter
 * bar (not a re-stretched 100%), and a tall node anchors the 100% tick.
 */
function toRows(
	snapshot: Snapshot,
	activeNodes: (n: string) => boolean,
	stackKeys: string[],
): Row[] {
	return snapshot.byNode
		.filter((n) => activeNodes(n.node))
		.map((n) => {
			const aliased: Record<string, number> = {};
			stackKeys.forEach((tableKey, idx) => {
				aliased[`t_${idx}`] = n.stacks[tableKey] ?? 0;
			});
			return { node: n.node, ...aliased, __total__: n.total };
		});
}

export function TableSizeSnapshot({
	snapshot,
	viewMode,
	selectedTable,
	onChipSelect,
	onBarClick,
	allOtherHint,
}: Props) {
	const colors = getChartColors();
	// The full cluster node list, used both for the legend and for color
	// assignment so the same node gets the same color on both panels.
	const clusterNodeIds = snapshot.byNode.map((n) => n.node);
	const { isActive, handleLegendClick } = useNodeSelection(clusterNodeIds);
	const normalized = viewMode === 'aggregate';

	if (allOtherHint) {
		return (
			<div className="flex h-full items-center justify-center text-sm text-(--color-text-secondary)">
				All tables are small within this window — widen the range to see growth.
			</div>
		);
	}

	const stackKeys = [...snapshot.tableSet, ...(snapshot.hasOther ? [OTHER_KEY] : [])];
	const rows = toRows(snapshot, isActive, stackKeys);

	// In Normalized mode the y-axis is scaled so the tallest (node-total)
	// bar hits 100%. Other bars sit shorter and missing segments show up
	// as visible gaps rather than renormalized stacks.
	const clusterMaxTotal = rows.reduce((m, r) => Math.max(m, r.__total__), 0) || 1;

	return (
		<div className="h-full flex flex-col">
			<div style={{ width: '100%', height: 300 }}>
				<ResponsiveContainer width="100%" height="100%" minWidth={0}>
					<BarChart data={rows} barCategoryGap="20%">
						<CartesianGrid stroke={colors.gridColor} strokeDasharray="3 3" />
						<XAxis dataKey="node" stroke={colors.axisColor} tick={{ fontSize: 11 }} />
						<YAxis
							stroke={colors.axisColor}
							tick={{ fontSize: 11 }}
							tickFormatter={(v) => {
								const n = Number(v);
								if (normalized) {
									return `${Math.round((n / clusterMaxTotal) * 100)}%`;
								}
								return formatBytes(n);
							}}
							domain={normalized ? [0, clusterMaxTotal] : ['auto', 'auto']}
						/>
						<Tooltip
							contentStyle={tooltipContentStyle}
							labelStyle={tooltipLabelStyle}
							itemStyle={tooltipItemStyle}
							formatter={(value, name, ctx) => {
								const nameStr = String(name);
								const label = nameStr === OTHER_KEY ? 'Other' : nameStr;
								const numValue = Number(value);
								const total = ((ctx as { payload?: Row })?.payload?.__total__ as number) ?? 0;
								const pct = total > 0 ? ((numValue / total) * 100).toFixed(1) : '0';
								return [
									`${formatBytes(numValue)} (${pct}% of node total ${formatBytes(total)})`,
									label,
								];
							}}
						/>
						{stackKeys.map((tableKey, idx) => {
							const baseColor = tableKey === OTHER_KEY ? OTHER_COLOR : getTableColor(idx);
							const isSelected = tableKey === selectedTable;
							return (
								<Bar
									key={tableKey}
									// Aliased dataKey ('t_<idx>') so Recharts' string-path lookup
									// works — table names like 'data.events' contain dots and would
									// otherwise be parsed as object paths. `name` keeps the real
									// table key for tooltips.
									dataKey={`t_${idx}`}
									name={tableKey}
									stackId="size"
									fill={baseColor}
									stroke={isSelected ? baseColor : 'transparent'}
									strokeWidth={isSelected ? 2 : 0}
									onClick={() => {
										if (tableKey !== OTHER_KEY) { onBarClick(tableKey); }
									}}
									style={{ cursor: tableKey === OTHER_KEY ? 'not-allowed' : 'pointer' }}
								>
									{rows.map((row) => (
										<Cell
											key={row.node}
											data-testid="table-size-segment"
											data-table={tableKey}
											data-node={row.node}
										/>
									))}
								</Bar>
							);
						})}
					</BarChart>
				</ResponsiveContainer>
			</div>
			<NodeLegend nodeIds={clusterNodeIds} isActive={isActive} onClickNode={handleLegendClick} />
			<TableSizeChipRow
				tableSet={snapshot.tableSet}
				hasOther={snapshot.hasOther}
				selectedTable={selectedTable}
				onSelectTable={onChipSelect}
			/>
		</div>
	);
}
