import { createContext } from 'react';
import { LocalUser, User } from '@/lib/api.patch';

export interface AuthenticationContextType {
	isLoading: boolean;
	setUser: (user: User | LocalUser | null) => void;
	user: User | LocalUser | null;
}

export const AuthenticationContext = createContext<AuthenticationContextType>({
	isLoading: true,
	setUser: () => {
	},
	user: null,
});

export function isLocalUser(user: User | LocalUser | null): user is LocalUser {
	return user !== null && !!(user as LocalUser).username;
}
