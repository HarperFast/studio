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
	if (organizationId === undefined) {
		return 'open';
	}
	const roles = user.roles ?? {};
	// A membership carrying `oauthProviders` is locked: its organization route is forbidden to this session, which
	// must sign in through that provider first (`organizationTargets.ts`).
	if (Object.hasOwn(roles, organizationId) && !('oauthProviders' in roles[organizationId])) {
		return 'open';
	}
	if (!('fabricRole' in user) && !('staffPermissions' in user)) {
		return 'unknown';
	}
	return hasStaffPermission(user, 'org:read') ? 'open' : 'closed';
}

function targetOrganization(to: string): string | undefined {
	const [firstSegment] = to.slice(1).split(/[/?#]/, 1);
	// Decoded as the router decodes `$organizationId`, so `/org%2Dx` is still `org-x`.
	let segment: string;
	try {
		segment = decodeURIComponent(firstSegment);
	} catch {
		return undefined;
	}
	const entity = detectEntityId(segment);
	return entity?.kind === 'organization' ? entity.id : undefined;
}
