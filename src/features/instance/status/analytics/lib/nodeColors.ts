/**
 * Categorical palette for per-node series. The actual color values live as
 * `--chart-node-*` CSS vars in src/index.css (single definition for light and
 * dark). Disjoint from TABLE_PALETTE and TYPE_PALETTE — enforced by
 * `__tests__/paletteDisjointness.test.ts`, which parses the CSS definitions.
 */
export const NODE_PALETTE = [
	'var(--chart-node-1)', // blue
	'var(--chart-node-2)', // green
	'var(--chart-node-3)', // orange
	'var(--chart-node-4)', // purple
	'var(--chart-node-5)', // pink
	'var(--chart-node-6)', // light blue
	'var(--chart-node-7)', // lavender
	'var(--chart-node-8)', // amber
	'var(--chart-node-9)', // red
	'var(--chart-node-10)', // lime
] as const;

export function getNodeColor(nodeId: string, allNodeIds: string[]): string {
	const sorted = [...allNodeIds].sort();
	const index = sorted.indexOf(nodeId);
	return NODE_PALETTE[index % NODE_PALETTE.length];
}
