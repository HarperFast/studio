import { useContext } from 'react';
import { AuthenticationContext, AuthenticationContextType } from '@/contexts/authenticationContext';

export function useAuthenticationContext(): AuthenticationContextType {
	return useContext(AuthenticationContext);
}
