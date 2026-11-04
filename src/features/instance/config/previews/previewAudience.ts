import { isDirectOperationsUrl } from '@/lib/urls/isDirectOperationsUrl';

/**
 * The `audience` for `enable_previews`: the operations URL as CI's `harper` CLI requests its token for it, which is also
 * the value of the repository variable. Harper compares it byte for byte and refuses one without an explicit port and a
 * trailing slash (`assertAudienceIsCanonical`, harper `security/authn/oidc/trustPolicyOperations.ts`).
 *
 * This follows `normalizeTarget` in harper's `bin/cliCredentials.ts` except for a URL with no port: a person typing
 * that means Harper's 9925, but this is a URL the browser is connected to, which means the protocol's default. Undefined
 * for the proxy's URL, or one that doesn't parse: a token requested for those could never match.
 */
export function previewAudience(operationsUrl: string | null | undefined): string | undefined {
	if (!isDirectOperationsUrl(operationsUrl)) {
		return undefined;
	}
	const url = new URL(operationsUrl);
	if (url.protocol !== 'http:' && url.protocol !== 'https:') {
		return undefined;
	}
	const port = url.port || (url.protocol === 'https:' ? '443' : '80');
	const path = url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`;
	// Assembled by hand: `URL` serializes a default port away.
	return `${url.protocol}//${url.hostname}:${port}${path}`;
}

/** `app.` under the audience's host name, as harper's `defaultPreviewDomain`; undefined for an IP or `localhost`. */
export function defaultPreviewDomain(audience: string | undefined): string | undefined {
	if (!audience) {
		return undefined;
	}
	try {
		const { hostname } = new URL(audience);
		return hostname && !/^[\d.]+$|^\[|^localhost$/i.test(hostname) ? `app.${hostname.toLowerCase()}` : undefined;
	} catch {
		return undefined;
	}
}
