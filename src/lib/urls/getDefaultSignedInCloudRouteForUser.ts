import { LocalUser, User } from '@/integrations/api/api.patch';
import { isLocalUser } from '@/lib/types/isLocalUser';

export function getDefaultSignedInCloudRouteForUser(user: User | LocalUser | null): string {
	if (user && !isLocalUser(user)) {
		const orgIds = Object.keys(user.roles);
		if (orgIds.length === 1) {
			return `/${orgIds[0]}`;
		}
	}
	return '/';
}
