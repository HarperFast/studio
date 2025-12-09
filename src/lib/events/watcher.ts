import { emitToListeners, useListener } from '@/lib/events/listener';
import { WatchedValueKeys, WatchedValuesTypeMap } from '@/lib/storage/watchedValueKeys';
import { useCallback, useState } from 'react';

interface ValueWrapper<T> {
	value: T;
	trigger?: unknown;
}

export function useWatchedValue<K extends keyof WatchedValuesTypeMap, T extends WatchedValuesTypeMap[K], D extends T>(
	name: K,
	defaultValue: D,
): ValueWrapper<T> {
	const [value, setValue] = useState<{ value: T; trigger?: unknown }>({ value: defaultValue });
	useListener(
		name,
		(newValue: T, trigger) => setValue({ value: newValue, trigger }),
		[setValue],
	);
	return value;
}

export function setWatchedValue<K extends keyof WatchedValuesTypeMap, T extends WatchedValuesTypeMap[K]>(
	name: WatchedValueKeys,
	value: T,
	trigger?: unknown,
): void {
	emitToListeners(name, value, trigger);
}

export function currySetWatchedValue<K extends keyof WatchedValuesTypeMap, T extends WatchedValuesTypeMap[K]>(
	name: WatchedValueKeys,
	value: T,
	trigger?: unknown,
): (e?: unknown) => void {
	return (e) => setWatchedValue(name, value, trigger ?? e);
}

export function useSetWatchedValue<K extends keyof WatchedValuesTypeMap, T extends WatchedValuesTypeMap[K]>(
	name: WatchedValueKeys,
	value: T,
	trigger?: unknown,
): () => void {
	return useCallback((e?: unknown) => {
		setWatchedValue(name, value, trigger ?? e);
	}, [name, value, trigger]);
}
