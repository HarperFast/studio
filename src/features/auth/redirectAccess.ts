import { hasStaffPermission } from '@/hooks/useAuth';
import type { LocalUser, User } from '@/integrations/api/api.patch';
import { detectEntityId } from '@/lib/string/entityId';
import { isLocalUser } from '@/lib/types/isLocalUser';
import type { PostSignInRedirect } from '@/lib/urls/postSignInRedirect';

/**
 * Whether the account signing in can open the organization a sign-in target leads into. Central manager refuses a
 * non-member's organization with a 403, before it looks the id up.
 *
 * `'unknown'` when only staff access would decide and this user record doesn't say: the `/Login/` answer carries
 * `roles` but neither `fabricRole` nor `staffPermissions`, which `/User/current` always does.
 */
export function redirectAccess(user: User | LocalUser, target: PostSignInRedirect): 'open' | 'closed' | 'unknown' {
	if (target.kind === 'server' || isLocalUser(user)) {
		return 'open';
	}
	const organizationId = targetOrganization(target.to);
	if (organizationId === undefined || Object.hasOwn(user.roles ?? {}, organizationId)) {
		return 'open';
	}
	if (!('fabricRole' in user) && !('staffPermissions' in user)) {
		return 'unknown';
	}
	return hasStaffPermission(user, 'org:read') ? 'open' : 'closed';
}

function targetOrganization(to: string): string | undefined {
	const [firstSegment] = to.slice(1).split(/[/?#]/, 1);
	const entity = detectEntityId(firstSegment);
	return entity?.kind === 'organization' ? entity.id : undefined;
}
