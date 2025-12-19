/**
 * Attempts to parse a string as JSON, and narrows the type down to the provided generic. Note that
 * no schema validation happens as a part of this, so the type might be inaccurate. But exceptions
 * won't be thrown by the actual parsing if invalid JSON is provided.
 * @param value
 */
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
