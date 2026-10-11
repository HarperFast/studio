import { useEffect, useState } from 'react';

/**
 * Whether `element` is within `rootMargin` of the viewport. Always true where the browser has no
 * `IntersectionObserver`, so work gated on it degrades to always-on rather than never running.
 * False for an element the observer has not reported on yet, including a replacement element.
 */
export function useIsOnScreen(element: Element | null, rootMargin = '0px'): boolean {
	const [observed, setObserved] = useState<{ element: Element; onScreen: boolean } | null>(null);

	useEffect(() => {
		if (!element || typeof IntersectionObserver === 'undefined') {
			return;
		}
		const observer = new IntersectionObserver(
			(entries) => {
				const entry = entries[entries.length - 1];
				if (entry) {
					setObserved({ element, onScreen: entry.isIntersecting });
				}
			},
			{ rootMargin },
		);
		observer.observe(element);
		return () => observer.disconnect();
	}, [element, rootMargin]);

	if (typeof IntersectionObserver === 'undefined') {
		return true;
	}
	return observed !== null && observed.element === element && observed.onScreen;
}
