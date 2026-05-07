/** Sort series by descending magnitude (sum across all points).
 *  Largest series first; rendered at bottom of stack by Recharts.
 *  Stable sort: ties preserve input order. */
export function sortByMagnitude<T extends { points: Array<{ y: number | null }> }>(
	series: readonly T[],
): T[] {
	return [...series].sort((a, b) => magnitude(b) - magnitude(a));
}

function magnitude(s: { points: Array<{ y: number | null }> }): number {
	return s.points.reduce((sum, p) => sum + (typeof p.y === 'number' ? p.y : 0), 0);
}
