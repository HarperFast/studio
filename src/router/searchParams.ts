import { defaultParseSearch, defaultStringifySearch } from '@tanstack/react-router';

/**
 * Search parameters that carry an opaque string from a link someone else built: the `token` and `flow` in
 * central-manager's verify-email and reset-password emails (`studioLink` in its `src/emails/emailService.js`). The
 * router's default parse runs `JSON.parse` on every value, so one that happened to read as JSON would stop being the
 * link's string: `12345678901234567890` loses its last digits, `1e5` becomes `100000`, `"x"` loses its quotes, and
 * `0`, `true` or `null` stop being strings.
 */
const VERBATIM_PARAMS = ['token', 'flow'];

export function parseSearch(searchStr: string): Record<string, unknown> {
	const search: Record<string, unknown> = defaultParseSearch(searchStr);
	if (!VERBATIM_PARAMS.some((key) => key in search)) {
		return search;
	}
	const params = new URLSearchParams(searchStr);
	for (const key of VERBATIM_PARAMS) {
		const value = params.get(key);
		if (value !== null) {
			search[key] = value;
		}
	}
	return search;
}

/**
 * The inverse of `parseSearch`. The default quotes a string that reads as JSON (`'0'` goes out as `%220%22`), which
 * `parseSearch` would keep, quotes and all, the next time the router read a URL it had written itself.
 */
export function stringifySearch(search: Record<string, unknown>): string {
	const searchStr = defaultStringifySearch(search);
	if (!VERBATIM_PARAMS.some((key) => typeof search[key] === 'string')) {
		return searchStr;
	}
	const params = new URLSearchParams(searchStr);
	for (const key of VERBATIM_PARAMS) {
		const value = search[key];
		if (typeof value === 'string') {
			params.set(key, value);
		}
	}
	return `?${params}`;
}
