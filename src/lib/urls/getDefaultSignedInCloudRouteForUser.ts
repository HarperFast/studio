import { getOrganizationTargets } from '@/features/organizations/lib/organizationTargets';
import type { LocalUser, User } from '@/integrations/api/api.patch';

export function getDefaultSignedInCloudRouteForUser(user: User | LocalUser | null): string {
	const targets = getOrganizationTargets(user);
	return targets.length === 1 && !targets[0].locked ? `/${targets[0].id}` : '/';
}
