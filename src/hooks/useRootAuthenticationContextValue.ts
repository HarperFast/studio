import { LocalUser, User } from '@/lib/api.patch';
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/react-query/constants';
import { apiClient } from '@/config/apiClient';
import { AuthenticationContextType } from '@/contexts/authenticationContext';
import { isLocalStudio } from '@/config/constants';
import { getUserInfo } from '@/features/instance/operations/queries/getUserInfo';

export function useRootAuthenticationContextValue(): AuthenticationContextType {
	const [user, setUser] = useState<User | LocalUser | null>(null);
	const { data, isLoading } = useQuery({
		queryKey: [queryKeys.user],
		queryFn: getCurrentUser,
		retry: false,
	});
	useEffect(() => setUser(data || null), [data, setUser]);
	return useMemo(() => {
		return {
			isLoading,
			setUser,
			user,
		};
	}, [user, setUser, isLoading]);
}

async function getCurrentUser(): Promise<User | LocalUser | null> {
	try {
		if (isLocalStudio) {
			return await getUserInfo();
		} else {
			const { data } = await apiClient.get('/User/current' as '/User/{id}');
			return data as User;
		}
	} catch {
		return null;
	}
}
