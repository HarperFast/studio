import { useEffect, useState } from 'react';
import {
	AuthenticatedConnection,
	AuthenticatedInstanceConnection,
	authStore,
	OverallAppSignIn,
} from '@/lib/authStore';
import { Cluster, Instance } from '@/lib/api.patch';

export function useAuth(): AuthenticatedConnection;
export function useAuth(entity: Instance | Cluster | string | null): AuthenticatedConnection;
export function useAuth(entity?: Instance | Cluster | string | null): AuthenticatedConnection {
	const [connection, setConnection] = useState<AuthenticatedConnection>({ user: null, isLoading: true });
	const noArgs = arguments.length === 0;
	useEffect(() => {
		const id = authStore.calculateIdFromEntity(noArgs ? OverallAppSignIn : entity);
		return authStore.listenToEntity(id, connection => {
			setConnection(connection);
		});
	}, [entity, noArgs]);
	return connection;
}

export function useInstanceAuth(entity: Instance | Cluster | string | null): AuthenticatedInstanceConnection {
	return useAuth(entity) as AuthenticatedInstanceConnection;
}
