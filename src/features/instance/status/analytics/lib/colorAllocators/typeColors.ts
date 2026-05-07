/** Protocol / type series colors. Six hues spread across the color wheel for
 *  accessibility and colorblind-friendliness. Disjoint from NODE_PALETTE and
 *  TABLE_PALETTE (enforced in test/colorAllocators/disjoint.test.ts). */
export const TYPE_PALETTE: readonly string[] = [
	'#0d9488', // teal-600
	'#dc2626', // red-600
	'#7c3aed', // violet-600
	'#d97706', // amber-600
	'#db2777', // pink-600
	'#0284c7', // sky-600
];

export function getTypeColor(typeKey: string, allKeys: readonly string[]): string {
	const sorted = [...allKeys].sort();
	const idx = sorted.indexOf(typeKey);
	return TYPE_PALETTE[(idx < 0 ? 0 : idx) % TYPE_PALETTE.length];
}
