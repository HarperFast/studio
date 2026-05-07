/**
 * @internal Exported for unit testing. Production callers should import the
 * re-export from HeatmapMatrix.tsx.
 *
 * Compute responsive cell size (px) for a heatmap grid.
 *  - clamp((containerWidth - rowLabelWidth - gap*(colCount-1)) / colCount, min, max)
 *  - Returns `min` when container is too narrow; `max` when too wide.
 */
export function computeCellSize(
	containerWidth: number,
	colCount: number,
	rowLabelWidth: number,
	gap: number,
	min: number,
	max: number,
): number {
	if (colCount <= 0) { return max; }
	const usable = containerWidth - rowLabelWidth - gap * Math.max(0, colCount - 1);
	const perCell = Math.floor(usable / colCount);
	return Math.max(min, Math.min(max, perCell));
}
