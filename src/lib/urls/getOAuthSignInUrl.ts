import { joinPath } from '@/lib/string/paths/joinPath';

/**
 * Where central-manager sends the browser after a successful built-in-provider login:
 * the SPA route that turns the fresh session into a signed-in app.
 */
export const checkOAuthRedirect = '/#/check-oauth';

/**
 * Direct link to the central-manager OAuth login endpoint for `provider` — a built-in
 * provider name (`google`, `github`) or a per-org OAuth config id (`oac-…`).
 *
 * Absolute against `VITE_CENTRAL_MANAGER_API_URL`, because the whole OAuth flow belongs to
 * the central-manager origin: it issues the `__Host-oauth_browser` CSRF cookie, the provider
 * only accepts the redirect URI registered for that origin, and the callback lands the
 * session cookie there. An origin-relative `/oauth/…` link happens to satisfy that only
 * where the CM also serves Studio (the deployed builds); anywhere else — the dev server,
 * a Harper instance serving the bundle — it hits a server with no `oauth` resource and the
 * user gets Harper's plain-text `Not found` 404.
 *
 * `redirect` is the post-login destination. Pass it for the built-in providers; leave it off
 * for a per-org provider (this is the same URL surfaced to admins on the org settings page) —
 * there the query param gets folded into the OAuth `redirect_uri` sent to the provider, which
 * then no longer matches the registered Login redirect URI and the provider rejects the
 * request (Okta 400 "redirect_uri").
 */
export function getOAuthSignInUrl(provider: string, redirect?: string): string {
	const url = joinPath(import.meta.env.VITE_CENTRAL_MANAGER_API_URL || '/', 'oauth', provider, 'login');
	return redirect ? `${url}?redirect=${encodeURIComponent(redirect)}` : url;
}
