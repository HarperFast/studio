/**
 * Categorical palette for tables in the table-size dashboard. The color
 * values live as `--chart-table-*` CSS vars in src/index.css, chosen to meet
 * WCAG AA contrast on both dark and light card surfaces.
 *
 * Deliberately distinct from NODE_PALETTE in `nodeColors.ts` so the two
 * categorical encodings (nodes and tables) don't visually collide — enforced
 * by `__tests__/paletteDisjointness.test.ts` against the CSS definitions.
 */
export const TABLE_PALETTE = [
	'var(--chart-table-1)', // red
	'var(--chart-table-2)', // orange
	'var(--chart-table-3)', // yellow
	'var(--chart-table-4)', // green
	'var(--chart-table-5)', // blue
	'var(--chart-table-6)', // mauve
	'var(--chart-table-7)', // brown
	'var(--chart-table-8)', // cyan
	'var(--chart-table-9)', // teal
	'var(--chart-table-10)', // grey
] as const;

/** Colour for the rolled-up "Other" stack — neutral grey so it reads as an aggregate. */
export const OTHER_COLOR = 'var(--chart-other)';

export function getTableColor(index: number): string {
	return TABLE_PALETTE[index % TABLE_PALETTE.length];
}
