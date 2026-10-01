import { useSyncExternalStore } from 'react';

// One shared 30s tick drives every coarse "time has passed" consumer (notification windows, clone
// progress ages) instead of an interval per component.
const TICK_MS = 30_000;
const nowListeners = new Set<() => void>();
let nowValue = Date.now();
let nowInterval: ReturnType<typeof setInterval> | null = null;

function subscribeNow(listener: () => void): () => void {
	nowListeners.add(listener);
	if (!nowInterval) {
		nowValue = Date.now(); // refresh on (re)start so the first subscriber isn't handed a stale value
		nowInterval = setInterval(() => {
			nowValue = Date.now();
			nowListeners.forEach((l) => l());
		}, TICK_MS);
	}
	return () => {
		nowListeners.delete(listener);
		if (nowListeners.size === 0 && nowInterval) {
			clearInterval(nowInterval);
			nowInterval = null;
		}
	};
}

/** A coarse, shared clock: re-renders subscribers every 30s. */
export function useNow(): number {
	return useSyncExternalStore(subscribeNow, () => nowValue, () => nowValue);
}
