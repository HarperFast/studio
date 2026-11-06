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
