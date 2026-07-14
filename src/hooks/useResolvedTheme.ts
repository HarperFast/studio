import { useEffect, useState } from 'react';

type ResolvedTheme = 'light' | 'dark';

/** Resolved app theme ('light' | 'dark') for the few code paths that
 *  genuinely branch in JS (e.g. chart color-stop interpolation, area fill
 *  opacity). The ThemeProvider (src/hooks/useTheme) already resolves the
 *  user's explicit choice vs. OS preference by toggling the `.dark` class
 *  on <html> — reading that class keeps consumers in lockstep with every
 *  other themed surface without re-deriving preference + media-query state.
 *  Everything color-related that CAN be a CSS token should use CSS vars
 *  instead and never touch this hook. */
export function useResolvedTheme(): ResolvedTheme {
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
