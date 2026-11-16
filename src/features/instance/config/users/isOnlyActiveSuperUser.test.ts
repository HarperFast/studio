import type { LocalRolePermission, LocalUser } from '@/integrations/api/api.patch';
import { describe, expect, it } from 'vitest';
import { isOnlyActiveSuperUser } from './isOnlyActiveSuperUser';

function user(username: string, active: boolean, permission: LocalRolePermission): LocalUser {
	return {
		username,
		active,
		role: { id: `${username}-role`, role: 'r', permission, __createdtime__: 0, __updatedtime__: 0 },
		__createdtime__: 0,
		__updatedtime__: 0,
	};
}

const admin = user('admin', true, { super_user: true });
const reader = user('reader', true, { super_user: false });

describe('isOnlyActiveSuperUser', () => {
	it('is true for the one active super user', () => {
		expect(isOnlyActiveSuperUser([admin, reader], 'admin')).toBe(true);
	});

	it('is false when another active super user remains', () => {
		expect(isOnlyActiveSuperUser([admin, reader, user('backup', true, { super_user: true })], 'admin')).toBe(false);
	});

	it('does not count an inactive super user as the one that remains', () => {
		expect(isOnlyActiveSuperUser([admin, user('dormant', false, { super_user: true })], 'admin')).toBe(true);
	});

	it('is false for a user who is not an active super user', () => {
		expect(isOnlyActiveSuperUser([admin, reader], 'reader')).toBe(false);
		expect(isOnlyActiveSuperUser([user('dormant', false, { super_user: true })], 'dormant')).toBe(false);
	});

	it('is false for a username not in the list', () => {
		expect(isOnlyActiveSuperUser([admin], 'ghost')).toBe(false);
	});
});
