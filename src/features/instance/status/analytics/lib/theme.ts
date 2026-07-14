/** Reads the studio chart-surface CSS tokens defined in src/index.css.
 *  All charts render inside a `Card`, so axis/grid colors resolve against
 *  `--card`, not the brand-purple `--background`. The hex defaults here are
 *  fallbacks for non-DOM environments (tests). Tooltip styling lives in
 *  primitives/tooltipStyle.ts — the one tooltip surface for all charts. */
export function getChartColors() {
	return {
		axisColor: 'var(--chart-axis, #6b7280)',
		gridColor: 'var(--chart-grid, #e5e7eb)',
	};
}
