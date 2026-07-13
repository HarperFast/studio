import { useMemo } from 'react';
import { NodeLegend } from '../charts/NodeLegend';
import { useNodeSelection } from '../hooks/useNodeSelection';
import { getNodeColor } from '../lib/nodeColors';
import type { AxisSpec, SeriesData } from '../types/analytics';
import { LineChart } from './LineChart';

interface Panel {
	title: string;
	data: SeriesData;
	yAxis?: AxisSpec | { left: AxisSpec; right?: AxisSpec };
}

interface Props {
	panels: Panel[];
	/** Minimum width per mini-panel (px). Grid auto-fits. Default 320. */
	minPanelWidth?: number;
	/** Height per mini-panel (px). Default 240. */
	panelHeight?: number;
	/** Pin every mini-panel's x-axis to the same [start, end] window. */
	xDomain?: [number, number];
	/** Fill the parent's vertical space (used by the expand dialog). */
	fillParent?: boolean;
}

export function SmallMultiples(
	{ panels, minPanelWidth = 320, panelHeight = 240, xDomain, fillParent }: Props,
) {
	// Union of node ids across all panels' per-node series (structured
	// `Series.node`). Cluster-aggregate series (no `node`) don't participate
	// in the legend.
	const nodeIds = useMemo(() => {
		const set = new Set<string>();
		for (const p of panels) {
			for (const s of p.data.series) {
				if (s.node) { set.add(s.node); }
			}
		}
		return [...set].sort();
	}, [panels]);

	const { isActive, handleLegendClick } = useNodeSelection(nodeIds);

	const filteredPanels = useMemo(() =>
		panels.map((p) => ({
			...p,
			data: {
				...p.data,
				series: p.data.series
					.filter((s) => s.node === undefined || isActive(s.node))
					.map((s) => s.node === undefined ? s : { ...s, color: s.color ?? getNodeColor(s.node, nodeIds) }),
			},
		})), [panels, isActive, nodeIds]);

	return (
		<div className="flex h-full flex-col">
			<div
				className="flex-1 min-h-0"
				style={{
					display: 'grid',
					gridTemplateColumns: `repeat(auto-fit, minmax(${minPanelWidth}px, 1fr))`,
					gap: '1rem',
				}}
			>
				{filteredPanels.map((panel, idx) => {
					const titleId = `sm-panel-${idx}-title`;
					return (
						<div key={panel.title}>
							<div
								id={titleId}
								data-testid="small-multiple-title"
								style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}
							>
								{panel.title}
							</div>
							<LineChart
								data={panel.data}
								yAxis={panel.yAxis}
								xDomain={xDomain}
								height={panelHeight}
								fillParent={fillParent}
								ariaLabel={`${panel.title}: chart with ${panel.data.series.length} series`}
								hideLegend
							/>
						</div>
					);
				})}
			</div>
			{nodeIds.length > 0 && (
				<NodeLegend
					nodeIds={nodeIds}
					isActive={isActive}
					onClickNode={handleLegendClick}
				/>
			)}
		</div>
	);
}
