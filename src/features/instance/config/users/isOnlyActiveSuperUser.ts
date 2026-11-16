import type { LocalUser } from '@/integrations/api/api.patch';

// Harper's own test (harper `security/superUserGuard.ts`), truthiness included.
function isActiveSuperUser(user: LocalUser): boolean {
	return Boolean(user.active && user.role?.permission?.super_user);
}

/**
 * Whether deactivating this user would leave the instance with no active super user. Harper refuses that
 * change itself from v5.2.1 (`assertActiveSuperUserRemains` in `alterUser`), but earlier versions, every
 * 4.x included, apply it, so the form refuses it on all of them.
 */
export function isOnlyActiveSuperUser(users: readonly LocalUser[], username: string): boolean {
	const target = users.find((user) => user.username === username);
	if (!target || !isActiveSuperUser(target)) {
		return false;
	}
	return !users.some((user) => user.username !== username && isActiveSuperUser(user));
}
