import { isDirectOperationsUrl } from '@/lib/urls/isDirectOperationsUrl';
import { describe, expect, it } from 'vitest';

describe('isDirectOperationsUrl', () => {
	it('accepts a direct instance/cluster operations URL', () => {
		expect(isDirectOperationsUrl('https://host.example:9925/')).toBe(true);
		expect(isDirectOperationsUrl('http://localhost:9925')).toBe(true);
		// A host merely named like the proxy segment is still direct (the check is on the path).
		expect(isDirectOperationsUrl('https://hdbinstance.example.com:9925/')).toBe(true);
	});

	it('rejects Fabric Connect proxy paths (case-insensitive, bare, concatenated, or with a query)', () => {
		expect(isDirectOperationsUrl('https://cm.example/HDBInstance/ins-1/operation')).toBe(false);
		expect(isDirectOperationsUrl('https://cm.example/Cluster/clu-1/operation')).toBe(false);
		expect(isDirectOperationsUrl('https://cm.example/hdbinstance/ins-1/operation')).toBe(false);
		expect(isDirectOperationsUrl('https://cm.example/HDBInstance')).toBe(false);
		expect(isDirectOperationsUrl('https://cm.example/HDBInstance123/operation')).toBe(false);
		expect(isDirectOperationsUrl('https://cm.example/Cluster?x=1')).toBe(false);
	});

	it('fails closed on empty, relative, or unparseable URLs', () => {
		expect(isDirectOperationsUrl(null)).toBe(false);
		expect(isDirectOperationsUrl(undefined)).toBe(false);
		expect(isDirectOperationsUrl('')).toBe(false);
		expect(isDirectOperationsUrl('/api')).toBe(false);
	});
});
