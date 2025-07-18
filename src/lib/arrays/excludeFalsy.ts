export function excludeFalsy<T>(item: T | undefined | 0 | false | null): item is T {
	return !!item;
}
