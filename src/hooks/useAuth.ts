import { useEffect, useState } from 'react';
import { AuthenticatedConnection, authStore, OverallAppSignIn } from '@/lib/authStore';
import { Cluster, Instance } from '@/lib/api.patch';

export function useAuth(): AuthenticatedConnection;
export function useAuth(entity: Instance | Cluster | null): AuthenticatedConnection;
export function useAuth(entity?: Instance | Cluster | null): AuthenticatedConnection {
	const [connection, setConnection] = useState<AuthenticatedConnection>({ user: null, isLoading: true });
	useEffect(() => {
		return authStore.listenToEntity(entity === undefined ? OverallAppSignIn : entity, connection => {
			setConnection(connection);
		});
	}, [entity]);
	return connection;
}
