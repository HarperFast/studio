/**
 * The pieces every panel that sets GitHub Actions up on a cluster shares: Previews and Deploy from GitHub today.
 */
import { isDirectOperationsUrl } from '@/lib/urls/isDirectOperationsUrl';

/**
 * The `audience` a trust policy pins: the operations URL as CI's `harper` CLI requests its token for, which is also the
 * value of the repository variable the workflow reads. Harper compares it byte for byte and refuses one without an
 * explicit port and a trailing slash (`assertAudienceIsCanonical`, harper `security/authn/oidc/trustPolicyOperations.ts`).
 *
 * This follows `normalizeTarget` in harper's `bin/cliCredentials.ts` except for a URL with no port: a person typing
 * that means Harper's 9925, but this is a URL the browser is connected to, which means the protocol's default. Undefined
 * for the proxy's URL, or one that doesn't parse: a token requested for those could never match.
 */
export function actionsAudience(operationsUrl: string | null | undefined): string | undefined {
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
