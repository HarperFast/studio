import { getSessionStorage } from '@/lib/storage/getSessionStorage';
import { SessionStorageKeys } from '@/lib/storage/sessionStorageKeys';
import { setSessionStorage } from '@/lib/storage/setSessionStorage';
import { useEffect, useState } from 'react';

/**
 * Uses state that gets bootstrapped from and persists to session storage with the key you specify.
 * This does NOT pub-sub value changes in realtime across instances of this hook!
 * @param key
 * @param defaultValue
 */
export function useSessionStorage<T, K extends keyof SessionStorageKeys>(key: K, defaultValue: T): [T, (value: (((prevState: T) => T) | T)) => void] {
	const state = useState<T>(getSessionStorage(key, defaultValue));
	const [current] = state;
	useEffect(() => setSessionStorage(key, current), [key, current]);
	return state;
}
