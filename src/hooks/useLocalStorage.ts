import { getLocalStorage } from '@/lib/storage/getLocalStorage';
import { LocalStorageKeys } from '@/lib/storage/localStorageKeys';
import { setLocalStorage } from '@/lib/storage/setLocalStorage';
import { useEffect, useState } from 'react';

/**
 * Uses state that gets bootstrapped from and persists to local storage with the key you specify.
 * This does NOT pub-sub value changes in realtime across instances of this hook!
 * @param key
 * @param defaultValue
 */
export function useLocalStorage<T>(key: LocalStorageKeys, defaultValue: T): [T, (value: (((prevState: T) => T) | T)) => void] {
	const state = useState<T>(getLocalStorage(key, defaultValue));
	const [current] = state;
	useEffect(() => setLocalStorage(key, current), [key, current]);
	return state;
}
