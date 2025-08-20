export function safeParse<T>(value: string | null | undefined): T | null {
	try {
		if (value === 'null' || value === 'undefined' || value === null || value === undefined) {
			return null;
		}
		return JSON.parse(value) as T;
	} catch (err) {
		console.error('safeParse failed to parse value, returning null instead', err);
		return null;
	}
}
