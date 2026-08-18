const REDACTED = '<redacted>';

/**
 * The auth screens carry a typed address between each other in `?me=`/`?email=`, and the RUM SDK
 * reads its URL fields from `window.location`, so the address would otherwise reach Error Tracking.
 * `redactErrorText` can't do this job: it keeps the path for Harper-owned hosts on purpose, which
 * is exactly what these routes are.
 *
 * Studio uses hash routing, so the param sits in the fragment — `new URL(url).search` is empty and
 * a `URLSearchParams` implementation would silently do nothing. Hence the string match.
 *
 * The value ends at `&`, `#`, whitespace, or a delimiter `zodRequireEmail` rejects (`"`, `,`, `<`,
 * `>`, `[`, `]`, `{`, `}`, `|`) — deliberately *not* at `'`, `(`, `)`, `!`, `~` or `*`, which it
 * accepts and `encodeURIComponent` leaves bare. Ending on those would emit
 * `?email=<redacted>'reilly%40example.com` and ship most of the address, and a partial redaction is
 * worse than none: it still identifies the person while looking handled. The residual cost is that
 * an apostrophe or bracket wrapping the URL in prose is consumed.
 */
const EMAIL_PARAM = /([?&](?:me|email)=)[^&#\s",<>[\]{}|]+/gi;

export function redactEmailParams(url: string) {
	return url.replace(EMAIL_PARAM, `$1${REDACTED}`);
}
