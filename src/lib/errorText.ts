/**
 * Turn an error of unknown shape into display text. Harper emits both bare strings and
 * structured `{ message, code }` objects (and shapes vary across versions), so always render
 * server-sent error values through this — interpolating the raw value shows
 * "[object Object]" (#1426). Prefers `.message`, falls back to JSON for structured payloads
 * without a usable one, and returns `undefined` for empty/absent input so callers can chain
 * their own fallback.
 */
export function errorText(error: unknown): string | undefined {
	if (error == null) {
		return undefined;
	}
	if (typeof error === 'string') {
		return error || undefined;
	}
	if (typeof error === 'object') {
		const { message } = error as { message?: unknown };
		if (typeof message === 'string' && message) {
			return message;
		}
		try {
			return JSON.stringify(error);
		} catch {
			return undefined;
		}
	}
	return String(error);
}
