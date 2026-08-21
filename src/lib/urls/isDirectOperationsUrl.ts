// The Fabric Connect proxy routes operations through these central-manager paths (see
// getInstanceClient). A URL whose PATH carries either segment points at the proxy, not the instance,
// so it must never receive an instance Bearer JWT or typed credentials — those would reach the central
// manager. The check is on the parsed pathname (case-insensitive), so a host merely named
// `hdbinstance.example.com` isn't rejected, while any proxy path — bare, cased, concatenated
// (`/HDBInstance123`), or with a query string — is. It fails closed: an unparseable/relative URL
// (which we can't prove points at the instance) is treated as non-direct.
export function isDirectOperationsUrl(url: string | null | undefined): url is string {
	if (!url) {
		return false;
	}
	let pathname: string;
	try {
		pathname = new URL(url).pathname;
	} catch {
		return false;
	}
	return !/\/(hdbinstance|cluster)/i.test(pathname);
}
