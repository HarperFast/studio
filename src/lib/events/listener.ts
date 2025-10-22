import { WatchedValueKeys, WatchedValuesTypeMap } from '@/lib/storage/watchedValueKeys';
import { useCallback, useEffect } from 'react';

const listenersMap: Record<string, Array<(newValue: unknown) => void>> = {};

export function useListener<K extends keyof WatchedValuesTypeMap, T extends WatchedValuesTypeMap[K]>(name: K, listener: (newValue: T) => void, deps: unknown) {
	const callback = useCallback(listener as (newValue: unknown) => void, [deps]);
	useEffect(() => {
		if (!listenersMap[name]) {
			listenersMap[name] = [];
		}
		listenersMap[name].push(callback);

		return function cleanUp() {
			const index = listenersMap[name].indexOf(callback);
			if (index >= 0) {
				listenersMap[name].splice(index, 1);
			}
		};
	}, [name, listener]);
}

export function emitToListeners<K extends keyof WatchedValuesTypeMap, T extends WatchedValuesTypeMap[K]>(name: K, value: T): void {
	const listeners = listenersMap[name] as Array<(newValue: T) => void>;
	if (listeners) {
		for (const listener of listeners) {
			listener(value);
		}
	}
}

export function curryEmitToListeners<K extends keyof WatchedValuesTypeMap, T extends WatchedValuesTypeMap[K]>(name: K, value: T): () => void {
	return () => emitToListeners(name, value);
}

export function useEmitToListeners<K extends keyof WatchedValuesTypeMap, T extends WatchedValuesTypeMap[K]>(name: WatchedValueKeys, value: T): () => void {
	return useCallback(() => emitToListeners(name, value), [name, value]);
}
