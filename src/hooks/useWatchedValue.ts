import { WatchedValueKeys, WatchedValuesTypeMap } from '@/lib/storage/watchedValueKeys';
import { useCallback, useEffect, useState } from 'react';

const listenersMap: Record<string, Array<(newValue: unknown) => void>> = {};

export function useWatchedValue<K extends keyof WatchedValuesTypeMap, T extends WatchedValuesTypeMap[K]>(name: K): T | undefined
export function useWatchedValue<K extends keyof WatchedValuesTypeMap, T extends WatchedValuesTypeMap[K], D extends T>(name: K, defaultValue: D): T
export function useWatchedValue<K extends keyof WatchedValuesTypeMap, T extends WatchedValuesTypeMap[K], D extends T>(name: K, defaultValue?: D): T | undefined {
	const [value, setValue] = useState<T | undefined>(defaultValue);

	useEffect(() => {
		const listener = (newValue: T) => {
			setValue(newValue);
		};
		if (!listenersMap[name]) {
			listenersMap[name] = [];
		}
		listenersMap[name].push(listener as (newValue: unknown) => void);

		return function cleanUp() {
			const index = listenersMap[name].indexOf(listener as (newValue: unknown) => void);
			if (index >= 0) {
				listenersMap[name].splice(index, 1);
			}
		};
	});

	return value;
}

export function setWatchedValue<K extends keyof WatchedValuesTypeMap, T extends WatchedValuesTypeMap[K]>(name: WatchedValueKeys, value: T): void {
	const listeners = listenersMap[name] as Array<(newValue: T) => void>;
	if (listeners) {
		for (const listener of listeners) {
			listener(value);
		}
	}
}

export function currySetWatchedValue<K extends keyof WatchedValuesTypeMap, T extends WatchedValuesTypeMap[K]>(name: WatchedValueKeys, value: T): () => void {
	return () => {
		setWatchedValue(name, value);
	};
}

export function useSetWatchedValue<K extends keyof WatchedValuesTypeMap, T extends WatchedValuesTypeMap[K]>(name: WatchedValueKeys, value: T): () => void {
	return useCallback(() => {
		setWatchedValue(name, value);
	}, [name, value]);
}
