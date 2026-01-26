export function linkify(fqdn: string): string {
	return new URL(
		!fqdn.match(/^https?:\/\//i)
			? `https://${fqdn}`
			: fqdn,
	).toString();
}
