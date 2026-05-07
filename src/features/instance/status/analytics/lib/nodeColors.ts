export const NODE_PALETTE = [
	'#58a6ff', // blue
	'#3fb950', // green
	'#f0883e', // orange
	'#bc8cff', // purple
	'#f778ba', // pink
	'#79c0ff', // light blue
	'#d2a8ff', // lavender
	'#ffa657', // amber
	'#ff7b72', // red
	'#7ee787', // lime
] as const;

export function getNodeColor(nodeId: string, allNodeIds: string[]): string {
	const sorted = [...allNodeIds].sort();
	const index = sorted.indexOf(nodeId);
	return NODE_PALETTE[index % NODE_PALETTE.length];
}
