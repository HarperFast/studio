import { LocalStorageKeys } from '@/lib/storage/localStorageKeys';

/**
 * Stores a value in local storage for later retrieval.
 * @param key
 * @param current
 */
export function setLocalStorage<T>(key: LocalStorageKeys, current: T): void {
	if (current === null || current === undefined) {
		localStorage.removeItem(key);
	} else {
		localStorage.setItem(key, JSON.stringify(current));
	}
}
