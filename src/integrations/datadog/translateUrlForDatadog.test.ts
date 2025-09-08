import { describe, expect, it } from 'vitest';
import { translateUrlForDatadog } from './translateUrlForDatadog';

describe('translateUrlForDatadog', () => {
	it('removes query string parameters and ensures trailing slash', () => {
		const href = '/acme/clu-123/browse/data/Users?like=this&and=that';
		const params = {
			organizationId: 'acme',
			clusterId: 'clu-123',
			databaseName: 'data',
			tableName: 'Users',
		};
		const result = translateUrlForDatadog(href, [params]);
		expect(result).toBe('/$organizationId/$clusterId/browse/$databaseName/$tableName/');
	});

	it('adds a trailing slash if missing', () => {
		const href = '/acme/';
		const result = translateUrlForDatadog(href, [{}]);
		expect(result).toBe('/acme/');

		const href2 = '/acme';
		const result2 = translateUrlForDatadog(href2, [{}]);
		expect(result2).toBe('/acme/');
	});

	it('replaces multiple parameters in the path', () => {
		const href = '/org-1/clu-2/instances/ins-3/';
		const params = {
			organizationId: 'org-1',
			clusterId: 'clu-2',
			instanceId: 'ins-3',
		};
		const result = translateUrlForDatadog(href, [params]);
		expect(result).toBe('/$organizationId/$clusterId/instances/$instanceId/');
	});

	it('does not replace when param value not present', () => {
		const href = '/org-1/other/';
		const params = {
			organizationId: 'org-2',
		};
		const result = translateUrlForDatadog(href, [params]);
		expect(result).toBe('/org-1/other/');
	});

	it('only replaces whole path segments bounded by slashes', () => {
		const href = '/files/my-org-1-file/';
		const params = {
			organizationId: 'org-1',
		};
		const result = translateUrlForDatadog(href, [params]);
		expect(result).toBe('/files/my-org-1-file/');
	});

	it('handles URL without trailing slash but parameters at end', () => {
		const href = '/dbs/data/tables/Users';
		const params = {
			databaseName: 'data',
			tableName: 'Users',
		};
		const result = translateUrlForDatadog(href, [params]);
		expect(result).toBe('/dbs/$databaseName/tables/$tableName/');
	});

	it('works with hash fragments and query strings in full href', () => {
		const href = 'https://example.com/app#/org-1/clu-2?x=1&y=2';
		const params = {
			organizationId: 'org-1',
			clusterId: 'clu-2',
		};
		// The function simply splits on '?', so the query is dropped; the rest remains intact, including protocol and host.
		const result = translateUrlForDatadog(href, [params]);
		expect(result).toBe('https://example.com/app#/$organizationId/$clusterId/');
	});

	it('works with multiple params', () => {
		const href = '/org-1/clu-2?x=1&y=2';
		const params: Record<string, string>[] = [
			{
				organizationId: 'org-1',
			},
			{
				clusterId: 'clu-2',
			},
		];
		const result = translateUrlForDatadog(href, params);
		expect(result).toBe('/$organizationId/$clusterId/');
	});
});
