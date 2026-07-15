/** Last segment of an FQDN as a stable short label.
 *  e.g. 'xb6-us-west-1.prod.ibm.harperfabric.com' → 'xb6-us-west-1'.
 *  Falls back to the full string if there's no dot. */
export function shortenNodeLabel(node: string): string {
	const dot = node.indexOf('.');
	return dot === -1 ? node : node.slice(0, dot);
}

/** Collision-aware short labels for a set of node FQDNs (display-layer only —
 *  callers must never write these back into series `label` fields, which CSV
 *  export and legends elsewhere rely on).
 *
 *  Each node starts at its first segment (same as shortenNodeLabel); when two
 *  distinct nodes share that segment (e.g. 'node1.us.acme.com' /
 *  'node1.eu.acme.com'), the colliding group keeps one more segment
 *  ('node1.us' / 'node1.eu') until the labels disambiguate, falling back to
 *  the full name when a node's segments are exhausted. */
export function shortNodeLabelMap(nodes: readonly string[]): Map<string, string> {
	const labels = new Map<string, string>();
	let pending = [...new Set(nodes)];
	for (let depth = 1; pending.length > 0; depth++) {
		const byPrefix = new Map<string, string[]>();
		for (const node of pending) {
			const prefix = node.split('.').slice(0, depth).join('.');
			const group = byPrefix.get(prefix);
			if (group) { group.push(node); }
			else { byPrefix.set(prefix, [node]); }
		}
		pending = [];
		for (const [prefix, group] of byPrefix) {
			if (group.length === 1) {
				labels.set(group[0], prefix);
				continue;
			}
			for (const node of group) {
				// A node whose whole name is the shared prefix can't extend
				// further — keep it in full; the rest retry one segment deeper.
				if (node.split('.').length <= depth) { labels.set(node, node); }
				else { pending.push(node); }
			}
		}
	}
	return labels;
}
