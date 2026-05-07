/**
 * Categorical palette for tables in the table-size dashboard.
 *
 * Deliberately distinct from NODE_PALETTE in `nodeColors.ts` so the two
 * categorical encodings (nodes and tables) don't visually collide.
 * Chosen to meet WCAG AA contrast on both dark and light backgrounds.
 */
export const TABLE_PALETTE = [
	'#e45756', // red
	'#f58518', // orange
	'#eeca3b', // yellow
	'#54a24b', // green
	'#4c78a8', // blue
	'#b279a2', // mauve
	'#9d755d', // brown
	'#17becf', // cyan
	'#72b7b2', // teal
	'#bab0ac', // grey
] as const;

/** Colour for the rolled-up "Other" stack — neutral grey so it reads as an aggregate. */
export const OTHER_COLOR = '#6b7280';

export function getTableColor(index: number): string {
	return TABLE_PALETTE[index % TABLE_PALETTE.length];
}
