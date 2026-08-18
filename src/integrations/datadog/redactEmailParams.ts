/**
 * Strip e-mail addresses out of a URL's form-persistence query params before it leaves the
 * browser for Datadog.
 *
 * The auth screens carry a typed address between each other so the visitor doesn't retype it —
 * `search={{ me: email }}` from sign-in, forgot-password and verify, and `?email=` on the
 * post-sign-up `/verifying` hand-off. That address then sits in `window.location`, which is where
 * the RUM SDK reads `view.url` and `view.referrer` from, so every view, resource, action and long
 * task recorded on an auth screen ships it to Error Tracking, where it is retained and searchable.
 * Most of those people are unauthenticated — prospects who never completed a sign-up.
 *
 * `redactErrorText` can't do this job. It reduces a URL to scheme + host + `<redacted>` only for
 * hosts Harper doesn't own, deliberately keeping the path for our own domains because that path is
 * how instance errors get triaged. Studio's auth routes are on `fabric.harper.fast`, so they take
 * that exemption. Redacting by param name rather than by host keeps both properties: the endpoint
 * stays readable, the address does not survive.
 *
 * Studio uses **hash routing**, so the param is in the fragment, not the query — for
 * `https://fabric.harper.fast/#/sign-in?me=…`, `new URL(url).search` is empty and the value lives
 * inside `.hash`. Hence a string match rather than `URLSearchParams`, which would silently do
 * nothing here.
 */

const REDACTED = '<redacted>';

/**
 * The form-persistence params, anchored to a `?`/`&` so only the whole param name matches: the
 * `me=` in `?resume=…` is preceded by `u`, not a separator. Requires a non-empty value, so the
 * bare `?me=` the auth links emit when no address has been typed yet stays as it is.
 */
const EMAIL_PARAM = /([?&](?:me|email)=)[^&#]+/gi;

/** Redact the e-mail-bearing auth params in `url`. Returns it unchanged if there are none. */
export function redactEmailParams(url: string) {
	return url.replace(EMAIL_PARAM, `$1${REDACTED}`);
}
