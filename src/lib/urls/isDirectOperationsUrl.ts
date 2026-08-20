// The Fabric Connect proxy routes operations through these central-manager paths (see
// getInstanceClient). A URL carrying either segment points at the proxy, not the instance, so it must
// never receive an instance Bearer JWT or typed credentials — those would reach the central manager.
// Matched case-insensitively so a differently-cased path can't slip a credential past this gate.
export function isDirectOperationsUrl(url: string | null | undefined): url is string {
	return !!url && !/\/(hdbinstance|cluster)\//i.test(url);
}
