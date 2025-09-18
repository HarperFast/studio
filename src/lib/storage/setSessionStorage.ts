import { SessionStorageKeys } from '@/lib/storage/sessionStorageKeys';

/**
 * Stores a value in session storage for later retrieval.
 * @param key
 * @param current
 */
export function setSessionStorage<T, K extends keyof SessionStorageKeys>(key: K, current: T): void {
	if (current === null || current === undefined) {
		sessionStorage.removeItem(String(key));
	} else {
		sessionStorage.setItem(String(key), JSON.stringify(current));
	}
}
