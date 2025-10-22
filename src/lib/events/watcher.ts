import { emitToListeners, useListener } from '@/lib/events/listener';
import { WatchedValueKeys, WatchedValuesTypeMap } from '@/lib/storage/watchedValueKeys';
import { useCallback, useState } from 'react';

export function useWatchedValue<K extends keyof WatchedValuesTypeMap, T extends WatchedValuesTypeMap[K]>(name: K): T | undefined
export function useWatchedValue<K extends keyof WatchedValuesTypeMap, T extends WatchedValuesTypeMap[K], D extends T>(name: K, defaultValue: D): T
export function useWatchedValue<K extends keyof WatchedValuesTypeMap, T extends WatchedValuesTypeMap[K], D extends T>(name: K, defaultValue?: D): T | undefined {
	const [value, setValue] = useState<T | undefined>(defaultValue);
	useListener(
		name,
		(newValue: T) => setValue(newValue),
		[setValue],
	);
	return value;
}

export function setWatchedValue<K extends keyof WatchedValuesTypeMap, T extends WatchedValuesTypeMap[K]>(name: WatchedValueKeys, value: T): void {
	emitToListeners(name, value);
}

export function currySetWatchedValue<K extends keyof WatchedValuesTypeMap, T extends WatchedValuesTypeMap[K]>(name: WatchedValueKeys, value: T): () => void {
	return () => setWatchedValue(name, value);
}

export function useSetWatchedValue<K extends keyof WatchedValuesTypeMap, T extends WatchedValuesTypeMap[K]>(name: WatchedValueKeys, value: T): () => void {
	return useCallback(() => setWatchedValue(name, value), [name, value]);
}
