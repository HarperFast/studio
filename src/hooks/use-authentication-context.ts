import { useContext } from 'react';
import { AuthenticationContext, AuthenticationContextType } from '@/contexts/authentication-context';

export function useAuthenticationContext(): AuthenticationContextType {
	return useContext(AuthenticationContext);
}
