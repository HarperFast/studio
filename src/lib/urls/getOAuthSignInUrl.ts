/**
 * Direct link to the central-manager OAuth login endpoint for a per-org OAuth
 * provider (e.g. Okta), identified by its `oac-…` config id.
 *
 * This is the same URL surfaced to admins on the org settings page. We link
 * straight to it rather than routing through an SPA page that appends
 * `?redirect=…`: that query param gets folded into the OAuth `redirect_uri`
 * sent to the provider, which then no longer matches the registered Login
 * redirect URI and the provider rejects the request (Okta 400 "redirect_uri").
 */
export function getOAuthSignInUrl(oauthConfigId: string): string {
	return `${import.meta.env.VITE_CENTRAL_MANAGER_API_URL}/oauth/${oauthConfigId}/login`;
}
