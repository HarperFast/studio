// Polyfills for chart primitive tests under jsdom. Recharts (and the wrapper
// chart components) read ResizeObserver via ResponsiveContainer; jsdom does
// not implement it. The implementation is a no-op stub — the chart tests
// don't depend on actual layout, just on the SVG markup Recharts emits.

class ResizeObserverStub {
	observe() {}
	unobserve() {}
	disconnect() {}
}

if (typeof globalThis.ResizeObserver === 'undefined') {
	globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}

// Recharts' ResponsiveContainer measures its parent and refuses to render at
// 0×0. Both jsdom and happy-dom report 0×0 for everything, so override
// getBoundingClientRect on Element to give charts a usable viewport.
if (typeof globalThis.Element !== 'undefined') {
	const origGetBoundingClientRect = Element.prototype.getBoundingClientRect;
	Element.prototype.getBoundingClientRect = function() {
		const rect = origGetBoundingClientRect.call(this);
		if (rect.width === 0 && rect.height === 0) {
			return {
				...rect,
				x: 0,
				y: 0,
				top: 0,
				left: 0,
				right: 800,
				bottom: 600,
				width: 800,
				height: 600,
				toJSON: () => ({}),
			};
		}
		return rect;
	};
	// HTMLElement offsetWidth / offsetHeight are read-only properties in some
	// DOM implementations; define them so Recharts' fallback measurement path
	// also reports a non-zero size.
	Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 800 });
	Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 600 });
}
