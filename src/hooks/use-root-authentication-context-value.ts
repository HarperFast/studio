import { User } from '@/lib/api.patch';
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/react-query/constants';
import { apiClient } from '@/config/apiClient';
import { AuthenticationContextType } from '@/contexts/authentication-context';

export function useRootAuthenticationContextValue(): AuthenticationContextType {
	const [user, setUser] = useState<User | null>(null);
	const isLocal = import.meta.env.VITE_LOCAL_STUDIO === 'true';
	const { data, isLoading } = useQuery({
		queryKey: [queryKeys.user],
		queryFn: getCurrentUser,
		retry: false,
		enabled: !isLocal,
	});
	useEffect(() => setUser(data || null), [data, setUser]);
	return useMemo(() => {
		return {
			isLoading,
			isLocal,
			setUser,
			user,
		};
	}, [user, setUser, isLoading, isLocal])
}

async function getCurrentUser(): Promise<User | null> {
	try {
		const { data } = await apiClient.get('/User/current' as '/User/{id}');
		return data as User;
	}
	catch {
		return null;
	}
}
