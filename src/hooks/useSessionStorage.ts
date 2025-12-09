import { useEffectedState } from '@/hooks/useEffectedState';
import { emitToListeners, useListener } from '@/lib/events/listener';
import { getSessionStorage } from '@/lib/storage/getSessionStorage';
import { SessionStorageKeys } from '@/lib/storage/sessionStorageKeys';
import { setSessionStorage } from '@/lib/storage/setSessionStorage';
import { useEffect } from 'react';

/**
 * Uses state that gets bootstrapped from and persists to session storage with the key you specify.
 * @param key
 * @param defaultValue
 */
export function useSessionStorage<T, K extends keyof SessionStorageKeys>(
	key: K,
	defaultValue: T,
): [T, (value: ((prevState: T) => T) | T) => void] {
	const state = useEffectedState<T>(getSessionStorage(key, defaultValue), [key]);
	const [current, setCurrent] = state;

	useEffect(() => {
		setSessionStorage(key, current);
		emitToListeners(`Session:${key}` as 'Session:{key}', current);
	}, [key, current]);

	useListener(`Session:${key}` as 'Session:{key}', function watchForInternalStorageChanges(newValue: T) {
		if (current !== newValue) {
			setCurrent(newValue);
		}
	}, [current, key, defaultValue]);

	useEffect(function watchForExternalStorageChanges() {
		const storageListener = (event: StorageEvent) => {
			if (event.key === key) {
				setCurrent(getSessionStorage(key, defaultValue));
			}
		};
		window.addEventListener('storage', storageListener);
		return () => {
			window.removeEventListener('storage', storageListener);
		};
	}, [key, setCurrent, defaultValue]);

	return state;
}
