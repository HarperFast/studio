export function safeParse<T>(value: string): T | null {
	try {
		return JSON.parse(value) as T;
	} catch (err) {
		console.error('safeParse failed to parse value, returning null instead', err);
		return null;
	}
}
