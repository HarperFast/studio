import { isDirectOperationsUrl } from '@/lib/urls/isDirectOperationsUrl';
import { describe, expect, it } from 'vitest';

describe('isDirectOperationsUrl', () => {
	it('accepts a direct instance/cluster operations URL', () => {
		expect(isDirectOperationsUrl('https://host.example:9925/')).toBe(true);
		expect(isDirectOperationsUrl('http://localhost:9925')).toBe(true);
	});

	it('rejects Fabric Connect proxy paths', () => {
		expect(isDirectOperationsUrl('https://cm.example/HDBInstance/ins-1/operation')).toBe(false);
		expect(isDirectOperationsUrl('https://cm.example/Cluster/clu-1/operation')).toBe(false);
	});

	it('rejects empty / missing URLs', () => {
		expect(isDirectOperationsUrl(null)).toBe(false);
		expect(isDirectOperationsUrl(undefined)).toBe(false);
		expect(isDirectOperationsUrl('')).toBe(false);
	});
});
