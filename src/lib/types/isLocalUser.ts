import { LocalUser, User } from '@/lib/api.patch';

export function isLocalUser(user: User | LocalUser | null): user is LocalUser {
	return user !== null && !!(user as LocalUser).username;
}
