import { formatValue } from '@/lib/formatValue';
import { useMemo } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useChartSyncProps } from '../context/AnalyticsContext';
import { useNodeSelection } from '../hooks/useNodeSelection';
import { getNodeColor } from '../lib/nodeColors';
import { computeGrowthAnnotation, type RankBy, type TableSizeDerived } from '../lib/tableSize';
import { getChartColors } from '../lib/theme';
import { formatAxisTick } from '../lib/time';
import { ChartTooltip } from '../primitives/ChartTooltip';
import type { TimeRange, ViewMode } from '../types/analytics';
import { NodeLegend } from './NodeLegend';
import { TableSizeChipRow } from './TableSizeChipRow';

/** One byte-format path for every chart — see src/lib/formatValue.ts. */
const formatBytes = (bytes: number) => formatValue(bytes, 'bytes-si');

interface Props {
	derived: TableSizeDerived;
	viewMode: ViewMode;
	selectedTable: string | null;
	/** Trend chip click — local to this panel; should NOT touch the Snapshot. */
	onChipSelect: (tableKey: string) => void;
	/** Whether the current selectedTable was user-chosen (true) vs auto (false). */
	manualSelection: boolean;
	/** Panel's active time range. Used for `/hr` growth annotation so the rate
	 * is grounded in the user-requested window, not the span of actual samples. */
	range: TimeRange;
	/** Cluster-wide node list (from snapshot). Ensures node colors match across panels. */
	clusterNodeIds: string[];
	/** Current ranking preference — controlled by Dashboard (single source of truth). */
	rankBy: RankBy;
	/** User toggled the rank. Dashboard persists to localStorage. */
	onRankChange: (r: RankBy) => void;
	/** True when rendered inside the expand-to-fullscreen dialog, which gets
	 *  its own crosshair-sync scope instead of the tab-wide one. Named to
	 *  match the chart primitives, but TableSizeTrend doesn't implement
	 *  fillParent *sizing* yet — this flag only scopes syncing. */
	fillParent?: boolean;
}

export function TableSizeTrend({
	derived,
	viewMode,
	selectedTable,
	onChipSelect,
	manualSelection,
	range,
	clusterNodeIds,
	rankBy,
	onRankChange,
	fillParent,
}: Props) {
	const colors = getChartColors();
	// Tab-scoped crosshair/tooltip sync (same treatment as the LineChart /
	// StackedAreaChart primitives) — the trend shares the tab's x-domain.
	// See useChartSyncProps for the dialog-scope rationale.
	const syncProps = useChartSyncProps(!!fillParent);

	const points = useMemo(
		() => (selectedTable ? derived.trend(selectedTable) : []),
		[derived, selectedTable],
	);

	const nodesWithData = useMemo(() => {
		const s = new Set<string>();
		for (const p of points) { for (const n of Object.keys(p.values)) { s.add(n); } }
		return [...s].sort();
	}, [points]);

	const { isActive, handleLegendClick } = useNodeSelection(nodesWithData);

	const windowMs = Math.max(0, range.endTime - range.startTime);

	// Alias node FQDN keys to `n_<idx>` so Recharts' string `dataKey` lookup
	// works — node names contain dots and would otherwise be parsed as paths.
	// MUST stay above the early `return` below to satisfy Rules of Hooks —
	// selectedTable can flip null↔string between renders.
	const nodeAlias = useMemo(() => {
		const m = new Map<string, string>();
		nodesWithData.forEach((node, idx) => m.set(node, `n_${idx}`));
		return m;
	}, [nodesWithData]);

	const chartData = useMemo(() =>
		points.map((p) => {
			const aliased: Record<string, number | null> = {};
			for (const [node, alias] of nodeAlias) {
				aliased[alias] = p.values[node] ?? null;
			}
			return { time: p.time, ...aliased };
		}), [points, nodeAlias]);

	if (!selectedTable) {
		return (
			<div className="flex h-full items-center justify-center text-sm text-(--color-text-secondary)">
				Select a table to view trend.
			</div>
		);
	}

	return (
		<div className="h-full flex flex-col">
			{
				/* SR-only live region: announces selection changes without adding visible
			    duplication of the ChartPanel title (which already interpolates the name). */
			}
			<div
				aria-live="polite"
				data-testid="table-size-trend-title"
				className="sr-only"
			>
				Trend selection: {selectedTable}
				{!manualSelection
					? ` (auto-selected — ${rankBy === 'bytes' ? 'largest bytes change' : 'largest percent change'})`
					: ''}
			</div>

			{!manualSelection && (
				<div className="mb-1 text-[10px] text-(--color-text-secondary)">
					Auto-selected by {rankBy === 'bytes' ? 'largest bytes change' : 'largest % change'}
				</div>
			)}

			{/* Rank toggle */}
			<div className="mb-2 flex items-center gap-2">
				<span className="text-[11px] text-(--color-text-secondary)">Rank by:</span>
				<div
					className="inline-flex rounded border border-(--color-border) bg-(--color-bg-tertiary) p-0.5"
					data-testid="table-size-rank-toggle"
				>
					<button
						type="button"
						aria-pressed={rankBy === 'bytes'}
						onClick={() => onRankChange('bytes')}
						className={`rounded px-2 py-0.5 text-[11px] ${
							rankBy === 'bytes'
								? 'bg-(--color-bg-secondary) text-(--color-text-primary)'
								: 'text-(--color-text-secondary)'
						}`}
					>
						Bytes changed
					</button>
					<button
						type="button"
						aria-pressed={rankBy === 'percent'}
						onClick={() => onRankChange('percent')}
						className={`rounded px-2 py-0.5 text-[11px] ${
							rankBy === 'percent'
								? 'bg-(--color-bg-secondary) text-(--color-text-primary)'
								: 'text-(--color-text-secondary)'
						}`}
					>
						% change
					</button>
				</div>
			</div>

			<div style={{ width: '100%', height: 300 }}>
				<ResponsiveContainer width="100%" height="100%" minWidth={0}>
					<LineChart data={chartData} {...syncProps}>
						<CartesianGrid stroke={colors.gridColor} strokeDasharray="3 3" />
						<XAxis
							dataKey="time"
							type="number"
							// Pin to the requested window so a sparse table-size response
							// (typically one sample every few minutes) doesn't collapse
							// the axis to the data span.
							domain={[range.startTime, range.endTime]}
							allowDataOverflow
							tickFormatter={formatAxisTick}
							stroke={colors.axisColor}
							tick={{ fontSize: 11 }}
							allowDuplicatedCategory={false}
						/>
						<YAxis
							stroke={colors.axisColor}
							tick={{ fontSize: 11 }}
							tickFormatter={formatBytes}
							scale={viewMode === 'per-node' ? 'log' : 'auto'}
							domain={viewMode === 'per-node' ? [1, 'auto'] : ['auto', 'auto']}
							allowDataOverflow
						/>
						<Tooltip content={<ChartTooltip formatter="bytes-si" nodeNames={nodesWithData} />} />
						{nodesWithData
							.filter((n) => isActive(n))
							.map((node) => (
								<Line
									key={node}
									// Aliased dataKey ('n_<idx>') so Recharts' string-path lookup
									// works — node FQDNs contain dots and would be parsed as paths.
									dataKey={nodeAlias.get(node)!}
									name={`${node} ${computeGrowthAnnotation({ points, node, windowMs, rankBy, formatBytes })}`.trim()}
									// Use clusterNodeIds (not nodesWithData) so the same node gets
									// the same color on both snapshot and trend panels.
									stroke={getNodeColor(node, clusterNodeIds)}
									strokeWidth={2}
									dot={false}
									type="monotone"
									connectNulls={false}
								/>
							))}
					</LineChart>
				</ResponsiveContainer>
			</div>
			<NodeLegend nodeIds={nodesWithData} isActive={isActive} onClickNode={handleLegendClick} />
			<TableSizeChipRow
				tableSet={derived.snapshot.tableSet}
				hasOther={derived.snapshot.hasOther}
				selectedTable={selectedTable}
				onSelectTable={onChipSelect}
			/>
		</div>
	);
}
