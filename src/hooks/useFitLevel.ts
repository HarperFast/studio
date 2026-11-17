import { type RefObject, useLayoutEffect, useState } from 'react';
import { flushSync } from 'react-dom';

/**
 * Which of `count` layouts, richest first, lets `ref`'s content fit its width. Each render that overflows moves one
 * step on before the browser paints. A wider element or a new `resetKey` starts again from the first; a narrower one
 * steps on from where it is. Only overflow moves it on, so content that grows (a name that loads late) is caught at
 * once, while content that shrinks waits for the next reset.
 */
export function useFitLevel(ref: RefObject<HTMLElement | null>, count: number, resetKey: string): number {
	const [fit, setFit] = useState({ level: 0, resetKey });
	if (fit.resetKey !== resetKey) {
		setFit({ level: 0, resetKey });
	}
	const level = fit.resetKey === resetKey ? Math.min(fit.level, count - 1) : 0;

	useLayoutEffect(() => {
		const element = ref.current;
		if (element && level < count - 1 && element.scrollWidth > element.clientWidth) {
			setFit((current) => ({ ...current, level: Math.min(current.level + 1, count - 1) }));
		}
	});

	useLayoutEffect(() => {
		const element = ref.current;
		if (!element || typeof ResizeObserver === 'undefined') {
			return;
		}
		let width = element.clientWidth;
		const observer = new ResizeObserver(() => {
			const wider = element.clientWidth > width;
			if (element.clientWidth === width) {
				return;
			}
			width = element.clientWidth;
			// Synchronously, so the steps down run before the next paint rather than flashing a layout that overflows.
			flushSync(() => setFit((current) => ({ ...current, level: wider ? 0 : current.level })));
		});
		observer.observe(element);
		return () => observer.disconnect();
	}, [ref]);

	return level;
}
