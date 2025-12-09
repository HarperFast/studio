// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function shallowCompareObjects(a: any, b: any): boolean {
	// Handle edge cases
	if (a === b) { return true; }
	if (!a || !b) { return false; }

	const aKeys = Object.keys(a);
	const bKeys = Object.keys(b);

	if (aKeys.length !== bKeys.length) {
		return false;
	}

	// Check if every key in a exists in b and has the same value
	for (const key of aKeys) {
		if (!bKeys.includes(key) || a[key] !== b[key]) {
			return false;
		}
	}

	return true;
}
