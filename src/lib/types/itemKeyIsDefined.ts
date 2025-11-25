export function itemKeyIsDefined<T, K extends keyof T>(item: T, key: K): item is T & Required<Pick<T, K>> {
	return item[key] !== undefined;
}
