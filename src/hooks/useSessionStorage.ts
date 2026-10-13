import { SessionStorageKeys } from '@/lib/storage/sessionStorageKeys';
import { readSessionValue, subscribeToSessionValue, writeSessionValue } from '@/lib/storage/sessionStorageStore';
import { useCallback, useInsertionEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react';

/**
 * Uses state that gets bootstrapped from and persists to session storage with the key you specify.
 * @param key
 * @param defaultValue Used when the key holds nothing yet. Like useState's initial value, later changes to
 * it are ignored: the first instance's default is the one kept.
 */
export function useSessionStorage<T, K extends keyof SessionStorageKeys>(
	key: K,
	defaultValue: T,
): [T, (value: ((prevState: T) => T) | T) => void] {
	const latest = useRef({ key, defaultValue });
	// Before any layout effect runs, so a child's layout effect on a key-change commit writes the new key.
	useInsertionEffect(() => {
		latest.current = { key, defaultValue };
	});
	const mounted = useRef(true);
	useLayoutEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
		};
	}, []);

	const subscribe = useCallback(
		(onChange: () => void) => subscribeToSessionValue(key, latest.current.defaultValue, onChange),
		[key],
	);
	const value = useSyncExternalStore(subscribe, () => readSessionValue(key, defaultValue));

	// Like a useState setter: stable across renders and key changes, and a no-op once unmounted, so a late
	// save can't clear a draft that a newer instance on the same file now holds.
	const setValue = useCallback((next: ((prevState: T) => T) | T) => {
		if (mounted.current) {
			writeSessionValue(latest.current.key, latest.current.defaultValue, next);
		}
	}, []);

	return [value, setValue];
}
