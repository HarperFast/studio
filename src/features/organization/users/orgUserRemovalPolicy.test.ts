import { getOrgUserRemovalPolicy, isAdminRoleName } from '@/features/organization/users/orgUserRemovalPolicy';
import { describe, expect, it } from 'vitest';

// Sensible defaults for a plain, unblocked case; each test overrides what it cares about.
const base = { canDelete: true, isSelf: false, orgUserCount: 3, adminCount: 2, isAdmin: false, roleCount: 1 };

describe('isAdminRoleName', () => {
	it('matches "admin" case-insensitively and trims whitespace', () => {
		expect(isAdminRoleName('admin')).toBe(true);
		expect(isAdminRoleName('Admin')).toBe(true);
		expect(isAdminRoleName('  ADMIN  ')).toBe(true);
	});

	it('does not match other role names', () => {
		expect(isAdminRoleName('administrator')).toBe(false);
		expect(isAdminRoleName('new_role')).toBe(false);
		expect(isAdminRoleName('')).toBe(false);
		expect(isAdminRoleName(undefined)).toBe(false);
	});
});

describe('getOrgUserRemovalPolicy', () => {
	it('lets an admin remove another user who holds roles', () => {
		expect(getOrgUserRemovalPolicy({ ...base, isSelf: false }))
			.toEqual({ canRemoveRoles: true, showRemovalAction: true, blockedReason: null });
	});

	it('lets you leave when other members and other admins remain', () => {
		expect(getOrgUserRemovalPolicy({ ...base, isSelf: true, isAdmin: true, orgUserCount: 3, adminCount: 2 }))
			.toEqual({ canRemoveRoles: true, showRemovalAction: true, blockedReason: null });
	});

	it('blocks the sole member with the sole-member notice', () => {
		expect(getOrgUserRemovalPolicy({ ...base, isSelf: true, isAdmin: true, orgUserCount: 1, adminCount: 1 }))
			.toEqual({ canRemoveRoles: false, showRemovalAction: false, blockedReason: 'sole-member' });
	});

	it('blocks the last admin even when other (non-admin) members remain', () => {
		expect(getOrgUserRemovalPolicy({ ...base, isSelf: true, isAdmin: true, orgUserCount: 4, adminCount: 1 }))
			.toEqual({ canRemoveRoles: false, showRemovalAction: false, blockedReason: 'last-admin' });
	});

	it('prefers the sole-member reason when you are both the only member and the only admin', () => {
		expect(
			getOrgUserRemovalPolicy({ ...base, isSelf: true, isAdmin: true, orgUserCount: 1, adminCount: 1 }).blockedReason,
		)
			.toBe('sole-member');
	});

	it('does not block a non-admin self when other members remain', () => {
		expect(getOrgUserRemovalPolicy({ ...base, isSelf: true, isAdmin: false, orgUserCount: 3, adminCount: 2 }))
			.toEqual({ canRemoveRoles: true, showRemovalAction: true, blockedReason: null });
	});

	it('does not block a self admin when another admin exists', () => {
		expect(
			getOrgUserRemovalPolicy({ ...base, isSelf: true, isAdmin: true, orgUserCount: 3, adminCount: 2 }).blockedReason,
		)
			.toBe(null);
	});

	it('never blocks when acting on another user, even in a one-member org', () => {
		// A fabric admin cleaning up someone else's solo org is never the "leave yourself" case.
		expect(getOrgUserRemovalPolicy({ ...base, isSelf: false, orgUserCount: 1, adminCount: 1 }))
			.toEqual({ canRemoveRoles: true, showRemovalAction: true, blockedReason: null });
	});

	it('hides everything (no notice) when the actor lacks delete permission', () => {
		expect(
			getOrgUserRemovalPolicy({
				...base,
				canDelete: false,
				isSelf: true,
				orgUserCount: 1,
				adminCount: 1,
				isAdmin: true,
			}),
		)
			.toEqual({ canRemoveRoles: false, showRemovalAction: false, blockedReason: null });
	});

	it('allows removal in principle but hides the action when the user holds no roles', () => {
		expect(getOrgUserRemovalPolicy({ ...base, isSelf: false, roleCount: 0 }))
			.toEqual({ canRemoveRoles: true, showRemovalAction: false, blockedReason: null });
	});
});
