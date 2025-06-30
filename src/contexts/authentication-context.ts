import { createContext } from 'react';
import { User } from '@/lib/api.patch';

export interface AuthenticationContextType {
	isLoading: boolean;
	isLocal: boolean;
	setUser: (user: User | null) => void;
	user: User | null;
}

export const AuthenticationContext = createContext<AuthenticationContextType>({
	isLoading: true,
	isLocal: import.meta.env.VITE_LOCAL_STUDIO === 'true',
	setUser: () => {},
	user: null,
});
