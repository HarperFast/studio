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

/**
 * Whether the audience's host is loopback, a private address or `.local`, which GitHub's hosted runners can't reach. A
 * self-hosted runner may, so callers warn rather than refuse.
 */
export function isPrivateAudience(audience: string): boolean {
	let hostname: string;
	try {
		// A fully qualified name may end in a dot, which `URL` keeps.
		hostname = new URL(audience).hostname.toLowerCase().replace(/\.$/, '');
	} catch {
		return false;
	}
	// `URL` writes an IPv4-mapped IPv6 address in hex, as `[::ffff:7f00:1]`.
	const mapped = /^\[::ffff:([0-9a-f]{1,4}):[0-9a-f]{1,4}\]$/.exec(hostname);
	const ipv4 = mapped ? undefined : /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(hostname);
	if (mapped || ipv4) {
		const high = mapped ? parseInt(mapped[1], 16) : 0;
		const [a, b] = mapped ? [high >> 8, high & 0xff] : [Number(ipv4![1]), Number(ipv4![2])];
		// Unspecified, private, loopback, link-local and CGNAT, where Tailscale addresses live.
		return a === 0 || a === 10 || a === 127 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31)
			|| (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127);
	}
	// IPv6 loopback, unspecified, unique-local and link-local.
	return /^(localhost|.*\.local|.*\.localhost|\[::1?\]|\[f[cd][0-9a-f]{2}:.*\]|\[fe[89ab][0-9a-f]:.*\])$/.test(
		hostname,
	);
}
