import { itemKeyIsDefined } from '@/lib/types/itemKeyIsDefined';

export function excludePropertyFalsy<T, K extends keyof T>(key: K) {
	return (item: T) => itemKeyIsDefined(item, key);
}
