export const OAUTH_HANDOFF_PARAM = 'oauth_handoff';

/**
 * Splits the sign-in handoff code out of a location hash such as
 * `#/check-oauth?redirect=%2Fx&oauth_handoff=<code>`. The plugin appends it to the fragment's own
 * query string. `hash` comes back unchanged when it carries no code, and without the parameter
 * (other parameters kept) when it does.
 */
export function splitOAuthHandoffCode(hash: string): { code: string | null; hash: string } {
	const queryStart = hash.indexOf('?');
	if (queryStart === -1) {
		return { code: null, hash };
	}
	const params = new URLSearchParams(hash.slice(queryStart + 1));
	if (!params.has(OAUTH_HANDOFF_PARAM)) {
		return { code: null, hash };
	}
	const code = params.get(OAUTH_HANDOFF_PARAM) || null;
	params.delete(OAUTH_HANDOFF_PARAM);
	const rest = params.toString();
	return { code, hash: `${hash.slice(0, queryStart)}${rest ? `?${rest}` : ''}` };
}

export function readOAuthHandoffCodeFromUrl(): string | null {
	return typeof location === 'undefined' ? null : splitOAuthHandoffCode(location.hash).code;
}

export function clearOAuthHandoffCodeFromUrl(): void {
	if (typeof location === 'undefined' || typeof history === 'undefined') {
		return;
	}
	const { code, hash } = splitOAuthHandoffCode(location.hash);
	if (code === null && hash === location.hash) {
		return;
	}
	history.replaceState(history.state, '', `${location.origin}${location.pathname}${location.search}${hash}`);
}
