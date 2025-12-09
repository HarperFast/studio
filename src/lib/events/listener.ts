import { WatchedValueKeys, WatchedValuesTypeMap } from '@/lib/storage/watchedValueKeys';
import { useCallback, useEffect } from 'react';

const listenersMap: Record<string, Array<(newValue: unknown, trigger?: unknown) => void>> = {};

export function useListener<K extends keyof WatchedValuesTypeMap, T extends WatchedValuesTypeMap[K]>(
	name: K,
	listener: (newValue: T, trigger?: unknown) => void,
	deps: unknown,
) {
	// eslint-disable-next-line react-hooks/preserve-manual-memoization,react-hooks/exhaustive-deps
	const callback = useCallback((newValue: T, trigger?: unknown) => listener(newValue, trigger), [deps]);
	useEffect(() => {
		if (!listenersMap[name]) {
			listenersMap[name] = [];
		}
		listenersMap[name].push(callback as (newValue: unknown, trigger?: unknown) => void);

		return function cleanUp() {
			const index = listenersMap[name].indexOf(callback as (newValue: unknown, trigger?: unknown) => void);
			if (index >= 0) {
				listenersMap[name].splice(index, 1);
			}
		};
	}, [name, listener, callback]);
}

export function emitToListeners<K extends keyof WatchedValuesTypeMap, T extends WatchedValuesTypeMap[K]>(
	name: K,
	value: T,
	trigger?: unknown,
): void {
	const listeners = listenersMap[name];
	if (listeners) {
		for (const listener of listeners) {
			listener(value, trigger);
		}
	}
}

export function curryEmitToListeners<K extends keyof WatchedValuesTypeMap, T extends WatchedValuesTypeMap[K]>(
	name: K,
	value: T,
	trigger?: unknown,
): (e?: unknown) => void {
	return (e?: unknown) => emitToListeners(name, value, trigger ?? e);
}

export function useEmitToListeners<K extends keyof WatchedValuesTypeMap, T extends WatchedValuesTypeMap[K]>(
	name: WatchedValueKeys,
	value: T,
	trigger?: unknown,
): () => void {
	return useCallback((e?: unknown) => emitToListeners(name, value, trigger ?? e), [name, value, trigger]);
}
