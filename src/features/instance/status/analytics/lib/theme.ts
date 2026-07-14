import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

/** Resolved app theme ('light' | 'dark') for the few chart internals that
 *  genuinely branch in JS (heatmap color-stop interpolation, area fill
 *  opacity). The app's ThemeProvider (src/hooks/useTheme) already resolves
 *  the user's explicit choice vs. OS preference by toggling the `.dark`
 *  class on <html> — reading that class keeps charts in lockstep with every
 *  other themed surface without re-deriving preference + media-query state.
 *  Everything color-related that CAN be a CSS token should use the
 *  `--chart-*` vars instead and never touch this hook. */
export function useResolvedTheme(): Theme {
	const [dark, setDark] = useState<boolean>(() =>
		typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
	);
	useEffect(() => {
		const root = document.documentElement;
		// Re-sync on mount: a theme toggle between the lazy initializer and
		// the observer attaching would otherwise be missed.
		setDark(root.classList.contains('dark'));
		const observer = new MutationObserver(() => {
			setDark(root.classList.contains('dark'));
		});
		observer.observe(root, { attributes: true, attributeFilter: ['class'] });
		return () => observer.disconnect();
	}, []);
	return dark ? 'dark' : 'light';
}

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
