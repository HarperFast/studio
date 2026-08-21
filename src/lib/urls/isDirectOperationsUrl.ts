// The Fabric Connect proxy routes operations through these central-manager paths (see
// getInstanceClient). A URL carrying either segment points at the proxy, not the instance, so it must
// never receive an instance Bearer JWT or typed credentials — those would reach the central manager.
// Matched case-insensitively and on a segment boundary (not requiring a trailing slash) so a
// differently-cased path, a bare `/HDBInstance`, or one with a query string can't slip past this gate.
export function isDirectOperationsUrl(url: string | null | undefined): url is string {
	return !!url && !/\/(hdbinstance|cluster)\b/i.test(url);
}
