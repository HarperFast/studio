export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'analytics-viz-theme';

export function getStoredTheme(): Theme {
	const stored = localStorage.getItem(STORAGE_KEY);
	if (stored === 'light' || stored === 'dark') { return stored; }
	return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function setStoredTheme(theme: Theme): void {
	localStorage.setItem(STORAGE_KEY, theme);
}

export function applyTheme(theme: Theme): void {
	document.documentElement.classList.toggle('dark', theme === 'dark');
}

/** Reads the studio chart-surface CSS tokens defined in src/index.css.
 *  All charts render inside a `Card`, so axis/grid/tooltip colors resolve
 *  against `--card`, not the brand-purple `--background`. The hex defaults
 *  here are fallbacks for non-DOM environments (tests). */
export function getChartColors(_theme: Theme) {
	return {
		axisColor: 'var(--chart-axis, #6b7280)',
		gridColor: 'var(--chart-grid, #e5e7eb)',
		tooltipBg: 'var(--chart-tooltip-bg, #ffffff)',
		tooltipBorder: 'var(--chart-grid, #d1d5db)',
		textColor: 'var(--chart-tooltip-fg, #1f2937)',
	};
}
