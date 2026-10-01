import { useSyncExternalStore } from 'react';

// One shared tick instead of an interval per component.
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

export function useNow(): number {
	return useSyncExternalStore(subscribeNow, () => nowValue, () => nowValue);
}
