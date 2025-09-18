import { LocalStorageKeys } from '@/lib/storage/localStorageKeys';
import { safeParse } from '@/lib/string/safeParse';

/**
 * Retrieves a value from local storage.
 * @param key
 * @param defaultValue
 */
export function getLocalStorage<T>(key: LocalStorageKeys, defaultValue: T): T {
	const lastSetValue = safeParse<T>(localStorage.getItem(key));
	return lastSetValue ?? defaultValue;
}
