/** Protocol / type series colors. Six hues spread across the color wheel for
 *  accessibility and colorblind-friendliness; values live as `--chart-type-*`
 *  CSS vars in src/index.css. Disjoint from NODE_PALETTE and TABLE_PALETTE
 *  (enforced in __tests__/paletteDisjointness.test.ts against the CSS
 *  definitions). */
export const TYPE_PALETTE: readonly string[] = [
	'var(--chart-type-1)', // teal-600
	'var(--chart-type-2)', // red-600
	'var(--chart-type-3)', // violet-600
	'var(--chart-type-4)', // amber-600
	'var(--chart-type-5)', // pink-600
	'var(--chart-type-6)', // sky-600
];

export function getTypeColor(typeKey: string, allKeys: readonly string[]): string {
	const sorted = [...allKeys].sort();
	const idx = sorted.indexOf(typeKey);
	return TYPE_PALETTE[(idx < 0 ? 0 : idx) % TYPE_PALETTE.length];
}
