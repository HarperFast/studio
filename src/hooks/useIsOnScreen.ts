import { useEffect, useState } from 'react';

/**
 * Whether `element` is within `rootMargin` of the viewport. Always true where the browser has no
 * `IntersectionObserver`, so work gated on it degrades to always-on rather than never running.
 */
export function useIsOnScreen(element: Element | null, rootMargin = '0px'): boolean {
	const [onScreen, setOnScreen] = useState(() => typeof IntersectionObserver === 'undefined');

	useEffect(() => {
		if (!element || typeof IntersectionObserver === 'undefined') {
			return;
		}
		const observer = new IntersectionObserver(
			(entries) => {
				const entry = entries.at(-1);
				if (entry) {
					setOnScreen(entry.isIntersecting);
				}
			},
			{ rootMargin },
		);
		observer.observe(element);
		return () => observer.disconnect();
	}, [element, rootMargin]);

	return onScreen;
}
