import { collectOrgUsers, countOrgAdmins } from '@/features/organization/users/orgRoleMembers';
import { SchemaOrganizationRole, SchemaUser } from '@/integrations/api/api.gen';
import { describe, expect, it } from 'vitest';

function user(id: string, email: string): SchemaUser {
	return { id, email, firstname: 'First', lastname: 'Last' };
}

function role(id: string, roleName: string, users: Array<SchemaUser | null>): SchemaOrganizationRole {
	return {
		id,
		roleName,
		organizationId: 'org-test',
		userIds: users.map((u, i) => u?.id ?? `usr-dangling-${i}`),
		// The server emits `null` for a `userIds` entry it cannot resolve; the generated type
		// does not admit that, so the cast is what the real payload looks like at runtime.
		users: users as SchemaUser[],
	};
}

const alice = user('usr-alice', 'alice@example.com');
const bob = user('usr-bob', 'bob@example.com');

describe('collectOrgUsers', () => {
	it('unions members across roles and sorts them by email', () => {
		const users = collectOrgUsers([role('rol-1', 'admin', [bob]), role('rol-2', 'reader', [alice])]);
		expect(users.map((u) => u.email)).toEqual(['alice@example.com', 'bob@example.com']);
	});

	it('collects every role a member holds', () => {
		const users = collectOrgUsers([role('rol-1', 'admin', [alice]), role('rol-2', 'reader', [alice])]);
		expect(users).toHaveLength(1);
		expect(users[0].roles?.map((r) => r.roleName)).toEqual(['admin', 'reader']);
	});

	// Regression: a role whose `userIds` points at a user record that no longer exists resolves to
	// `[null]`, which used to throw "Cannot read properties of null (reading 'id')" and replace the
	// whole Users page with an error boundary.
	it('skips unresolved user references instead of throwing', () => {
		const roles = [role('rol-1', 'admin', [alice]), role('rol-2', 'roletwo', [null])];
		expect(() => collectOrgUsers(roles)).not.toThrow();
		expect(collectOrgUsers(roles).map((u) => u.email)).toEqual(['alice@example.com']);
	});

	it('still returns the resolvable members of a partially dangling role', () => {
		const users = collectOrgUsers([role('rol-1', 'admin', [alice, null, bob])]);
		expect(users.map((u) => u.email)).toEqual(['alice@example.com', 'bob@example.com']);
	});

	it('handles a role with no users array at all', () => {
		const bare: SchemaOrganizationRole = { id: 'rol-1', roleName: 'empty', organizationId: 'org-test', userIds: [] };
		expect(collectOrgUsers([bare])).toEqual([]);
	});
});

describe('countOrgAdmins', () => {
	it('counts distinct members holding an admin role', () => {
		expect(countOrgAdmins([role('rol-1', 'admin', [alice, bob]), role('rol-2', 'reader', [alice])])).toBe(2);
	});

	it('does not double-count a member holding two admin roles', () => {
		expect(countOrgAdmins([role('rol-1', 'admin', [alice]), role('rol-2', 'Admin', [alice])])).toBe(1);
	});

	// Same dangling-reference guard as above: an unresolved admin reference must not throw, and must
	// not inflate the count that gates "last admin cannot leave".
	it('skips unresolved user references without inflating the count', () => {
		const roles = [role('rol-1', 'admin', [alice, null])];
		expect(() => countOrgAdmins(roles)).not.toThrow();
		expect(countOrgAdmins(roles)).toBe(1);
	});

	it('ignores non-admin roles', () => {
		expect(countOrgAdmins([role('rol-1', 'reader', [alice, bob])])).toBe(0);
	});
});
