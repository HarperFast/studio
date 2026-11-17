import { type RefObject, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

const overflowsItsWidth = (element: HTMLElement) => element.scrollWidth > element.clientWidth;

/**
 * Which of `count` layouts, richest first, lets `ref`'s content fit its width. Each render where `overflows` holds
 * moves one step on before the browser paints, and so does a resize of the element or its children that leaves it
 * not fitting (a web font loading). A wider element or a new `resetKey` starts again from the first. Content that
 * shrinks never moves it back, so `resetKey` must change with anything that can shrink the content.
 */
export function useFitLevel(
	ref: RefObject<HTMLElement | null>,
	count: number,
	resetKey: string,
	overflows: (element: HTMLElement) => boolean = overflowsItsWidth,
): number {
	const [fit, setFit] = useState({ level: 0, resetKey });
	if (fit.resetKey !== resetKey) {
		setFit({ level: 0, resetKey });
	}
	const level = fit.resetKey === resetKey ? Math.min(fit.level, count - 1) : 0;
	const latest = useRef({ overflows, count });

	useLayoutEffect(() => {
		latest.current = { overflows, count };
		const element = ref.current;
		if (element && level < count - 1 && overflows(element)) {
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
			const previous = width;
			width = element.clientWidth;
			const wider = width > previous;
			if (!wider && !latest.current.overflows(element)) {
				return;
			}
			// Synchronously, so the steps down run before the next paint rather than flashing a layout that overflows.
			// Returning the state unchanged lets React skip the render when there is nowhere to go.
			flushSync(() =>
				setFit((current) => {
					const next = wider ? 0 : Math.min(current.level + 1, latest.current.count - 1);
					return next === current.level ? current : { ...current, level: next };
				})
			);
		});
		observer.observe(element);
		for (const child of element.children) {
			observer.observe(child);
		}
		return () => observer.disconnect();
	}, [ref]);

	return level;
}
