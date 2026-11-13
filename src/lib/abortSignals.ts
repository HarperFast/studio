/**
 * Combine multiple `AbortSignal`s into one that aborts when any input does, plus a `cleanup`
 * to detach any listeners it attached. Uses the native `AbortSignal.any` when available
 * (modern browsers / Node 20+) — which manages its own listeners — and falls back to manual
 * wiring (with real cleanup) otherwise.
 */
export function anySignal(signals: Array<AbortSignal | undefined>): { signal: AbortSignal; cleanup: () => void } {
	const noop = () => {};
	const real = signals.filter((s): s is AbortSignal => !!s);
	if (real.length === 1) {
		return { signal: real[0], cleanup: noop };
	}
	if (typeof AbortSignal.any === 'function') {
		return { signal: AbortSignal.any(real), cleanup: noop };
	}
	const controller = new AbortController();
	// Function declarations (hoisted) so onAbort and cleanup can reference each other.
	function cleanup() {
		for (const s of real) {
			s.removeEventListener('abort', onAbort);
		}
	}
	function onAbort(event: Event) {
		controller.abort((event.target as AbortSignal).reason);
		cleanup();
	}
	for (const s of real) {
		if (s.aborted) {
			controller.abort(s.reason);
			cleanup();
			break;
		}
		s.addEventListener('abort', onAbort);
	}
	return { signal: controller.signal, cleanup };
}

/** Aborts with a `TimeoutError` after `ms`, as `AbortSignal.timeout` does, in browsers that lack it. */
export function timeoutSignal(ms: number): { signal: AbortSignal; cleanup: () => void } {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(new DOMException('The operation timed out.', 'TimeoutError')), ms);
	return { signal: controller.signal, cleanup: () => clearTimeout(timer) };
}
