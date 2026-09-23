import { describe, expect, it } from 'vitest';
import { type OrganizationTarget, selectOrganizations, summarizeOrganizations } from './organizationListModel';

const targets: OrganizationTarget[] = [
	{ id: 'b', name: 'Acme', roleName: 'owner', locked: false, providers: [] },
	{ id: 'a', name: 'Acme', roleName: 'developer', locked: false, providers: [] },
	{ id: 'c', name: 'Locked team', roleName: 'fabric staff', locked: true, providers: [] },
];
describe('organization discovery', () => {
	it('counts the complete list and filters locked memberships by name', () => {
		expect(summarizeOrganizations(targets)).toEqual({ total: 3, accessible: 2, locked: 1 });
		expect(selectOrganizations(targets, 'locked', 'all', '', false).map(target => target.id)).toEqual(['c']);
		expect(selectOrganizations(targets, 'missing', 'all', '', false)).toEqual([]);
	});
	it('combines access and role without presenting locked entries as staff', () => {
		expect(selectOrganizations(targets, '', 'locked', '', false).map(target => target.id)).toEqual(['c']);
		expect(selectOrganizations(targets, '', 'all', 'fabric staff', false)).toEqual([]);
		expect(selectOrganizations(targets, '', 'accessible', 'owner', false).map(target => target.id)).toEqual(['b']);
	});
	it('reverses the complete name and ID ordering without mutating its input', () => {
		expect(selectOrganizations(targets, '', 'all', '', false).map(target => target.id)).toEqual(['a', 'b', 'c']);
		expect(selectOrganizations(targets, '', 'all', '', true).map(target => target.id)).toEqual(['c', 'b', 'a']);
		expect(targets.map(target => target.id)).toEqual(['b', 'a', 'c']);
	});
});
