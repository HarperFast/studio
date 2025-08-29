const numberPrefix = new RegExp(/^\d+/);

export function sortByNumberPrefix(a: string, b: string): number {
	const aPrefix = parseInt(a.match(numberPrefix)?.[0] || '0', 10);
	const bPrefix = parseInt(b.match(numberPrefix)?.[0] || '0', 10);
	if (aPrefix === bPrefix) {
		return 0;
	}
	return aPrefix > bPrefix ? 1 : -1;
}
