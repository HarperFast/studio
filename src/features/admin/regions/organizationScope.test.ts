import { resolveOrganizationScope } from '@/features/admin/regions/organizationScope';
import { describe, expect, it } from 'vitest';

describe('resolveOrganizationScope', () => {
	it('sends the selection when orgs are picked', () => {
		expect(resolveOrganizationScope(['org-1'], null, true)).toEqual(['org-1']);
		expect(resolveOrganizationScope(['org-1'], [], false)).toEqual(['org-1']);
	});

	it('sends null when the admin clears the selection on purpose', () => {
		expect(resolveOrganizationScope([], ['org-1'], true)).toBeNull();
		expect(resolveOrganizationScope([], [], true)).toBeNull();
	});

	it('preserves a stored empty scope when the field was never touched', () => {
		// The bug this guards: [] means "hidden from every org"; collapsing it to null on an
		// unrelated edit would silently publish the region to everyone.
		expect(resolveOrganizationScope([], [], false)).toEqual([]);
	});

	it('keeps a public region public when the field was never touched', () => {
		expect(resolveOrganizationScope([], null, false)).toBeNull();
		expect(resolveOrganizationScope([], undefined, false)).toBeNull();
	});

	it('treats a create (no stored value) with no selection as public', () => {
		expect(resolveOrganizationScope([], undefined, true)).toBeNull();
	});
});
