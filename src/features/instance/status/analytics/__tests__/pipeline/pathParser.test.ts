import { describe, expect, it } from 'vitest';
import { parseReplicationPath } from '../../pipeline/pathParser';

const NODES = [
	'xb6-us-west-1.prod.ibm.harperfabric.com',
	'4u4-us-east-1.prod.ibm.harperfabric.com',
	'846-fr-par-1.prod.ibm.harperfabric.com',
];

describe('parseReplicationPath', () => {
	it('anchors a 5-dot hostname and splits db.table from the remainder', () => {
		const out = parseReplicationPath(
			'4u4-us-east-1.prod.ibm.harperfabric.com.data.events',
			NODES,
		);
		expect(out).toEqual({
			source: '4u4-us-east-1.prod.ibm.harperfabric.com',
			database: 'data',
			table: 'events',
		});
	});

	it('picks the longest matching node prefix', () => {
		const out = parseReplicationPath(
			'xb6-us-west-1.prod.ibm.harperfabric.com.system.hdb_analytics',
			NODES,
		);
		expect(out?.source).toBe('xb6-us-west-1.prod.ibm.harperfabric.com');
		expect(out?.database).toBe('system');
		expect(out?.table).toBe('hdb_analytics');
	});

	it('returns null for a numeric port-style path', () => {
		const out = parseReplicationPath('9926' as unknown as string, NODES);
		expect(out).toBe(null);
	});

	it('falls back to heuristic split when no known-node prefix matches', () => {
		// Heuristic: last 2 segments are db.table; everything before is source.
		// Recovers records from sources not in the cluster snapshot
		// (asymmetric replication, decommissioned nodes, gateways).
		const out = parseReplicationPath(
			'unknown-host.example.com.data.events',
			NODES,
		);
		expect(out).toEqual({
			source: 'unknown-host.example.com',
			database: 'data',
			table: 'events',
		});
	});

	it('returns null for a path with too few segments to be db.table', () => {
		// 'foo.events' is just 2 segments — can't have source + db + table.
		expect(parseReplicationPath('foo.events', NODES)).toBe(null);
		// Single segment.
		expect(parseReplicationPath('justsource', NODES)).toBe(null);
	});

	it('returns null on empty input', () => {
		expect(parseReplicationPath('', NODES)).toBe(null);
	});
});
