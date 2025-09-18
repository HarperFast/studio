import { SessionStorageKeys } from '@/lib/storage/sessionStorageKeys';
import { safeParse } from '@/lib/string/safeParse';

/**
 * Retrieves a value from session storage.
 * @param key
 * @param defaultValue
 */
export function getSessionStorage<T, K extends keyof SessionStorageKeys>(key: K, defaultValue: T): T {
	const lastSetValue = safeParse<T>(sessionStorage.getItem(String(key)));
	return lastSetValue ?? defaultValue;
}
