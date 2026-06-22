const UTM_PARAM_PREFIX = 'utm_';

/**
 * Removes any `utm_*` tracking parameters from a query string, leaving every
 * other parameter (and their order) untouched.
 *
 * Accepts a search string with or without the leading `?`. Returns a search
 * string with a leading `?` when parameters remain, or an empty string when
 * none do. When there is nothing to remove the input is returned verbatim so
 * callers can cheaply detect "no change".
 */
export function stripUtmParams(search: string): string {
	const params = new URLSearchParams(search);
	// Snapshot the keys before deleting: URLSearchParams.keys() is a live
	// iterator, so mutating mid-iteration can skip entries.
	const utmKeys = Array.from(params.keys()).filter(key => key.toLowerCase().startsWith(UTM_PARAM_PREFIX));
	if (utmKeys.length === 0) {
		return search;
	}
	for (const key of utmKeys) {
		params.delete(key);
	}
	const next = params.toString();
	return next ? `?${next}` : '';
}

/**
 * Clears `utm_*` tracking parameters from the browser's current URL without
 * triggering a navigation.
 *
 * Marketing links append UTM parameters to the query string that precedes the
 * hash route (e.g. `https://studio.harperdb.io/?utm_source=x#/sign-in`), which
 * is what Google Tag Manager reads. Once they've been captured they only linger
 * in the address bar, so we strip them after a user signs in or signs up. We
 * rewrite only the search portion and preserve the hash (the app's actual
 * route) via history.replaceState so the current view is unaffected.
 */
export function clearUtmParamsFromUrl(): void {
	// Guard the browser globals so importing/calling this in a non-DOM context
	// (e.g. the node-based test environment) is a harmless no-op rather than a
	// ReferenceError.
	if (typeof location === 'undefined' || typeof history === 'undefined') {
		return;
	}
	const { search, pathname, hash, origin } = location;
	const nextSearch = stripUtmParams(search);
	if (nextSearch === search) {
		return;
	}
	history.replaceState(history.state, '', `${origin}${pathname}${nextSearch}${hash}`);
}
