import { getNodeColor } from '../lib/nodeColors';
import { shortNodeLabelMap } from '../lib/nodeLabels';

interface NodeLegendProps {
	nodeIds: string[];
	isActive: (nodeId: string) => boolean;
	onClickNode: (nodeId: string, ctrlKey: boolean) => void;
	/** When true, renders all buttons as non-interactive (gray-out only).
	 *  Selection state is preserved — visual / interactivity change only. */
	disabled?: boolean;
}

export function NodeLegend({ nodeIds, isActive, onClickNode, disabled }: NodeLegendProps) {
	// Show collision-aware short names (matching the chart series + tooltip),
	// keeping the full FQDN on `title` for hover. Chips previously rendered the
	// raw FQDN, so series read short while their own filter read long (#1515).
	const shortLabels = shortNodeLabelMap(nodeIds);
	return (
		<div
			role="group"
			aria-label={disabled ? 'Node filter (unavailable on this tab)' : 'Node filter'}
			className="flex flex-wrap justify-center gap-x-4 gap-y-1 pt-2 text-[11px]"
		>
			{disabled && (
				<span className="sr-only" aria-live="polite">
					Per-node filter is unavailable on this tab. Buttons remain visible to preserve selection state.
				</span>
			)}
			{nodeIds.map((node) => {
				const color = getNodeColor(node, nodeIds);
				const active = isActive(node);
				const baseOpacity = active ? 1 : 0.3;
				const buttonStyle = disabled
					? { color, opacity: 0.5, cursor: 'not-allowed' as const }
					: { color, opacity: baseOpacity };
				return (
					<button
						key={node}
						type="button"
						aria-pressed={active}
						// `aria-disabled` (not `disabled`) keeps the button in the
						// tab order and announces its state to AT, while the click
						// handler still no-ops when disabled. `disabled` would
						// remove the element from focus order entirely, so SR users
						// couldn't discover what the legend means on this tab.
						aria-disabled={disabled ? 'true' : undefined}
						title={disabled ? "Per-node filter unavailable on this tab's panels" : node}
						onClick={(e) => {
							if (disabled) { return; }
							onClickNode(node, e.ctrlKey || e.metaKey);
						}}
						className="inline-flex items-center gap-1.5 cursor-pointer border-none bg-transparent p-0"
						style={buttonStyle}
					>
						<span
							className="inline-block h-[3px] w-3 rounded"
							style={{ backgroundColor: color }}
						/>
						<span>{shortLabels.get(node) ?? node}</span>
					</button>
				);
			})}
		</div>
	);
}
