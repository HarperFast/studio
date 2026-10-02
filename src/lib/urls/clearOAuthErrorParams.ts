const OAUTH_ERROR_PARAMS = ['error', 'reason'];

/**
 * Removes the `error`/`reason` query params `@harperfast/oauth` appends on a failed
 * sign-in redirect, leaving every other parameter (and their order) untouched.
 *
 * Accepts a search string with or without the leading `?`. Returns a search string
 * with a leading `?` when parameters remain, or an empty string when none do. When
 * there is nothing to remove the input is returned verbatim so callers can cheaply
 * detect "no change".
 */
export function stripOAuthErrorParams(search: string): string {
	const params = new URLSearchParams(search);
	const present = OAUTH_ERROR_PARAMS.filter((key) => params.has(key));
	if (present.length === 0) {
		return search;
	}
	for (const key of present) {
		params.delete(key);
	}
	const next = params.toString();
	return next ? `?${next}` : '';
}

/**
 * Clears the OAuth plugin's `error`/`reason` params from the browser's current URL
 * without triggering a navigation, so reloading the check-oauth page doesn't
 * re-show the failure toast.
 *
 * The plugin appends these with the URL API, which puts them before the hash
 * (`/?error=auth_failed&reason=csrf#/check-oauth`) — same reason
 * `clearUtmParamsFromUrl` rewrites only the search portion and preserves the hash.
 */
export function clearOAuthErrorParamsFromUrl(): void {
	// Guard the browser globals so importing/calling this in a non-DOM context
	// (e.g. the node-based test environment) is a harmless no-op rather than a
	// ReferenceError.
	if (typeof location === 'undefined' || typeof history === 'undefined') {
		return;
	}
	const { search, pathname, hash, origin } = location;
	const nextSearch = stripOAuthErrorParams(search);
	if (nextSearch === search) {
		return;
	}
	history.replaceState(history.state, '', `${origin}${pathname}${nextSearch}${hash}`);
}
