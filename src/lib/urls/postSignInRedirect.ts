/**
 * Where a sign-in may continue to, read from a `redirect` search param such as `/#/sign-in?redirect=…`. Every
 * sign-in flow reads `redirect` through this file, so this is the one place that decides what may be followed.
 *
 * Two kinds of target:
 * - an in-app route (`/org-…/clu-…/usage`), which the router navigates to inside the hash;
 * - the Fabric MCP connector's authorization endpoint, `/oauth/mcp/authorize?…`. Central-manager's
 *   `@harperfast/oauth` sends a signed-out user to `/#/sign-in?redirect={returnTo}` (`mcp.sessionLogin.loginUrl`
 *   in central-manager's `config.yaml`) and expects them back there once Studio has a session. It is a path on
 *   this origin's server, not a route, so it needs a full-page navigation.
 *
 * That endpoint is the only server path allowed, and only relative to this origin: no other path, no scheme or
 * host, no `//`. The value checked is the one TanStack Router has already decoded once, so an encoded `%2F` or
 * `%3F` stays literal and can never complete the path.
 */

export type PostSignInRedirect =
	| { kind: 'app'; to: string }
	| { kind: 'server'; href: string };

const MCP_AUTHORIZE_REDIRECT = /^\/oauth\/mcp\/authorize(?:\?|$)/;
/** The plugin's own return path never holds one: its query comes from `URLSearchParams`. */
const NOT_IN_AUTHORIZE_REDIRECT = /[ \\#]/;
/** The oauth plugin refuses a sign-in URL longer than this (`MAX_RETURN_URL_LENGTH`, `lib/mcp/sessionLogin.js`). */
const MAX_SERVER_REDIRECT_LENGTH = 2048;
/** A path, never `//host` or `/\host`, which some URL parsers read as protocol-relative. */
const APP_PATH = /^\/(?![/\\])/;
/** The server's namespace: no Studio route lives under it, and only the authorize path there may be followed. */
const SERVER_OAUTH_PATH = /^\/oauth/i;

/** U+0000 to U+001F and U+007F, which a browser strips or rewrites while parsing a URL: `/<tab>/host` reads as `//host`. */
function hasControlCharacter(value: string): boolean {
	for (let index = 0; index < value.length; index++) {
		const code = value.charCodeAt(index);
		if (code < 0x20 || code === 0x7f) {
			return true;
		}
	}
	return false;
}

function isMcpAuthorizeRedirect(redirect: string): boolean {
	return redirect.length <= MAX_SERVER_REDIRECT_LENGTH
		&& !hasControlCharacter(redirect)
		&& !NOT_IN_AUTHORIZE_REDIRECT.test(redirect)
		&& MCP_AUTHORIZE_REDIRECT.test(redirect);
}

export function appRedirectTarget(redirect: unknown): string | undefined {
	return typeof redirect === 'string'
			&& APP_PATH.test(redirect)
			&& !SERVER_OAUTH_PATH.test(redirect)
			&& !hasControlCharacter(redirect)
		? redirect
		: undefined;
}

export function postSignInRedirect(redirect: unknown): PostSignInRedirect | undefined {
	if (typeof redirect === 'string' && isMcpAuthorizeRedirect(redirect)) {
		return { kind: 'server', href: redirect };
	}
	const to = appRedirectTarget(redirect);
	return to === undefined ? undefined : { kind: 'app', to };
}

export function postSignInRedirectParam(redirect: unknown): string | undefined {
	const target = postSignInRedirect(redirect);
	return target?.kind === 'server' ? target.href : target?.to;
}

/**
 * The `redirect` from the fragment's own query (`#/check-oauth?redirect=…`), for the page the oauth plugin lands on.
 * Not the router's search: the plugin puts `error` and `reason` before the `#`, and the hash history appends that query
 * to the fragment's, so the last fragment param reads `state=s?error=access_denied`.
 */
export function redirectFromFragment(hash: string): string | undefined {
	const queryStart = hash.indexOf('?');
	if (queryStart === -1) {
		return undefined;
	}
	const queryEnd = hash.indexOf('#', queryStart);
	return new URLSearchParams(hash.slice(queryStart + 1, queryEnd === -1 ? undefined : queryEnd)).get('redirect')
		?? undefined;
}

export function redirectSearch(redirect: unknown): { redirect: string } | undefined {
	const param = postSignInRedirectParam(redirect);
	return param === undefined ? undefined : { redirect: param };
}

/**
 * Follows a server target with a full-page load, which the router cannot do: it only ever changes the hash.
 * Replacing, not pushing, the entry: Back would otherwise reach a sign-in page that, finding the new session, loads
 * the authorization again with a `state` the client has already used.
 */
export function followServerRedirect(href: string): void {
	window.location.replace(href);
}
