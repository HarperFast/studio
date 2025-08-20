import { safeParse } from '@/lib/string/safeParse';
import { useEffect, useState } from 'react';

export const enum LocalStorageKeys {
	'SavedClusterState' = 'SavedClusterState'
}

/**
 * Uses state that gets bootstrapped from and persists to local storage with the key you specify.
 * This does NOT pub-sub value changes in realtime across instances of this hook!
 * @param key
 * @param defaultValue
 */
export function useLocalStorage<T>(key: LocalStorageKeys, defaultValue: T): [T, (value: (((prevState: T) => T) | T)) => void] {
	const lastSetValue = safeParse<T>(localStorage.getItem(key));
	const state = useState<T>(lastSetValue ?? defaultValue);
	const [current] = state;
	useEffect(() => {
		if (current === null || current === undefined) {
			localStorage.removeItem(key);
		} else {
			localStorage.setItem(key, JSON.stringify(current));
		}
	}, [key, current]);
	return state;
}
