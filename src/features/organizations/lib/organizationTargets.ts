import { hasStaffPermission } from '@/hooks/useAuth';
import type { LocalUser, User } from '@/integrations/api/api.patch';
import { isLocalUser } from '@/lib/types/isLocalUser';

export function getOrganizationTargets(user: User | LocalUser | null) {
	if (!user || isLocalUser(user)) { return []; }
	const staffAccess = hasStaffPermission(user, 'org:read');
	return Object.entries(user.roles ?? {}).map(([id, role]) => ({
		id,
		name: role.organizationName || id,
		roleName: role.role ?? 'fabric staff',
		locked: 'oauthProviders' in role && !staffAccess,
		providers: role.oauthProviders ?? [],
	})).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}
