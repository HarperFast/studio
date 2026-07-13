/** Last segment of an FQDN as a stable short label.
 *  e.g. 'xb6-us-west-1.prod.ibm.harperfabric.com' → 'xb6-us-west-1'.
 *  Falls back to the full string if there's no dot. */
export function shortenNodeLabel(node: string): string {
	const dot = node.indexOf('.');
	return dot === -1 ? node : node.slice(0, dot);
}
