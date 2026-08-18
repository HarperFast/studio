const REDACTED = '<redacted>';

/**
 * Studio uses hash routing, so these params sit in the URL fragment: `new URL(url).search` is empty
 * and a `URLSearchParams` implementation would silently do nothing. Hence the string match.
 *
 * `token` is matched by name because nothing about its value looks special, and it is a live
 * credential — `ResetPassword` reads it from this query and exchanges it for a password change.
 * The second pass matches any param whose *value* holds an address, because a name list only covers
 * the params someone remembered (`?filters={"email":"…"}` deep-links carry one). It matches values,
 * not paths, so `/HDBInstance/<id>/operation` stays readable; an address embedded in a URL *path*
 * (`/config/users/<address>`) is out of reach of both passes.
 *
 * The value deliberately does not end at `'`, `(`, `)`, `!`, `~` or `*`: those are valid in an
 * address and survive `encodeURIComponent`, so ending there would emit
 * `?email=<redacted>'reilly%40example.com` — a partial redaction still identifies the person while
 * looking handled. The delimiters it does end at cannot appear in an address `zodRequireEmail`
 * accepts, so stopping there can't truncate one; the backslash is among them because consuming it
 * would corrupt the escaping of a JSON payload quoted in an error message.
 */
const NAMED_PARAM = /([?&](?:me|email|token)=)[^&#\s",<>[\]{}|\\]+/gi;
const ADDRESS_VALUED_PARAM = /([?&][^=&#\s]+=)[^&#\s",<>[\]{}|\\]*(?:@|%40)[^&#\s",<>[\]{}|\\]*/gi;

/** Mirrors `redactErrorText`: a URL ending a clause shouldn't lose the punctuation after it. */
const TRAILING_PUNCTUATION = /[.,:;!?]+$/;

function redactValue(match: string, param: string) {
	const trailing = TRAILING_PUNCTUATION.exec(match)?.[0] ?? '';
	return `${param}${REDACTED}${trailing}`;
}

export function redactSensitiveParams(url: string) {
	// Neither pass can match without a param separator, and most Studio URLs are a bare hash route.
	if (!url.includes('?') && !url.includes('&')) {
		return url;
	}
	return url.replace(NAMED_PARAM, redactValue).replace(ADDRESS_VALUED_PARAM, redactValue);
}
