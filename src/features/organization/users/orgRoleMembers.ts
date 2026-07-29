/**
 * Derives the org's member list (and its admin headcount) from the roles payload.
 *
 * A user belongs to an org only by holding org roles, so the member list is the union of every
 * role's `users`, with each member carrying the roles they hold.
 *
 * `OrganizationRole.users` is the server's resolution of `userIds`, and an id it cannot resolve
 * comes back as a literal `null` element rather than being omitted — a dangling reference left
 * behind when a user record goes away while roles still point at it. The generated type says
 * `users?: SchemaUser[]` (elements non-nullable), so nothing catches this at compile time and a
 * single stale reference used to take the whole Users page down with
 * "Cannot read properties of null (reading 'id')". Both readers below skip unresolved entries so
 * one bad record degrades to a missing row instead of an error boundary.
 */
import { SchemaOrganizationRole, SchemaUser } from '@/integrations/api/api.gen';
import { sortByEmail } from '@/lib/arrays/sort/byEmail';
import { isAdminRoleName } from './orgUserRemovalPolicy';

/** Resolved members of a role, with unresolved (`null`) references dropped. */
function resolvedUsers(organizationRole: SchemaOrganizationRole): SchemaUser[] {
	return (organizationRole.users ?? []).filter((user): user is SchemaUser => user != null);
}

/** Distinct org members, each with the roles they hold, sorted by email. */
export function collectOrgUsers(organizationRoles: SchemaOrganizationRole[]): SchemaUser[] {
	const users: Record<SchemaUser['id'], SchemaUser> = {};
	for (const organizationRole of organizationRoles) {
		for (const user of resolvedUsers(organizationRole)) {
			if (!users[user.id]) {
				users[user.id] = { ...user, roles: [] };
			}
			users[user.id].roles!.push(organizationRole);
		}
	}
	return Object.values(users).sort(sortByEmail);
}

/**
 * Distinct members holding an admin role — used to keep the last admin from removing their own
 * admin role or leaving (which would leave the org with no one able to manage it).
 */
export function countOrgAdmins(organizationRoles: SchemaOrganizationRole[]): number {
	const adminUserIds = new Set<SchemaUser['id']>();
	for (const organizationRole of organizationRoles) {
		if (isAdminRoleName(organizationRole.roleName)) {
			for (const user of resolvedUsers(organizationRole)) {
				adminUserIds.add(user.id);
			}
		}
	}
	return adminUserIds.size;
}
