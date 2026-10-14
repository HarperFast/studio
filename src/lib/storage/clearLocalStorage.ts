export function clearLocalStorage(keep: readonly string[]): void {
	const keys: string[] = [];
	for (let index = 0; index < localStorage.length; index++) {
		const key = localStorage.key(index);
		if (key !== null && !keep.includes(key)) {
			keys.push(key);
		}
	}
	const failures: unknown[] = [];
	for (const key of keys) {
		try {
			localStorage.removeItem(key);
		} catch (error) {
			failures.push(error);
		}
	}
	if (failures.length) {
		throw failures[0];
	}
}
