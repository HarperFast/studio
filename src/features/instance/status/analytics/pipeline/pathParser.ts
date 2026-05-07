export interface ParsedReplicationPath {
	source: string;
	database: string;
	table: string;
}

/** Parse a replication-latency `path` field shaped `<source>.<db>.<table>`.
 *
 *  Two-stage parse:
 *    1. **Anchored** — try the longest matching node from `knownNodes`. If
 *       a hostname prefix matches exactly, this is precise.
 *    2. **Heuristic fallback** — if no known-node prefix matches, treat the
 *       last two dot-segments as `<db>.<table>` and everything before as the
 *       source FQDN. Recovers records whose source isn't a destination in
 *       the current cluster snapshot (asymmetric replication, decommissioned
 *       nodes, gateways that send but never receive). May mis-parse if a
 *       database name itself contains dots — accept the trade since the
 *       alternative is silently dropping the record.
 *
 *  Returns null only when the path is empty, < 3 segments, or has empty
 *  trailing segments. */
export function parseReplicationPath(
	path: string,
	knownNodes: readonly string[],
): ParsedReplicationPath | null {
	if (typeof path !== 'string' || path.length === 0) { return null; }

	const sorted = [...knownNodes].sort((a, b) => b.length - a.length);

	for (const node of sorted) {
		if (!path.startsWith(node + '.')) { continue; }
		const rest = path.slice(node.length + 1);
		const firstDot = rest.indexOf('.');
		if (firstDot === -1) { return null; }
		const database = rest.slice(0, firstDot);
		const table = rest.slice(firstDot + 1);
		if (database.length === 0 || table.length === 0) { return null; }
		return { source: node, database, table };
	}

	// Heuristic: split on '.', last two segments are db.table.
	const segments = path.split('.');
	if (segments.length < 3) { return null; }
	const table = segments[segments.length - 1];
	const database = segments[segments.length - 2];
	const source = segments.slice(0, -2).join('.');
	if (!source || !database || !table) { return null; }
	return { source, database, table };
}
