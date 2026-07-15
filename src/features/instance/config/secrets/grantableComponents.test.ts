import { APIDirectoryEntry } from '@/integrations/api/instance/applications/getComponents';
import { describe, expect, it } from 'vitest';
import { grantableComponentNames } from './grantableComponents';

function tree(entries: APIDirectoryEntry['entries']): APIDirectoryEntry {
	return { name: 'root', entries };
}

describe('grantableComponentNames', () => {
	it('returns [] for an undefined tree', () => {
		expect(grantableComponentNames(undefined)).toEqual([]);
	});

	it('returns the top-level directory (component) names, sorted', () => {
		const result = grantableComponentNames(
			tree([
				{ name: 'web-app', entries: [] },
				{ name: 'auth-service', entries: [{ name: 'index.js' }] },
				{ name: 'billing', entries: [], package: '@acme/billing' },
			]),
		);
		expect(result).toEqual(['auth-service', 'billing', 'web-app']);
	});

	it('drops top-level files that are not components (no entries)', () => {
		const result = grantableComponentNames(
			tree([
				{ name: 'my-app', entries: [] },
				{ name: 'harperdb-config.yaml' } as APIDirectoryEntry,
			]),
		);
		expect(result).toEqual(['my-app']);
	});

	it('de-duplicates repeated component names', () => {
		const result = grantableComponentNames(
			tree([
				{ name: 'dup', entries: [] },
				{ name: 'dup', entries: [] },
			]),
		);
		expect(result).toEqual(['dup']);
	});
});
