import { useEffect, useState } from 'react';
import { AuthenticatedConnection, authStore } from '@/lib/authStore';
import { Cluster, Instance } from '@/lib/api.patch';

export function useAuth(): AuthenticatedConnection;
export function useAuth(entity: Instance | Cluster | null): AuthenticatedConnection;
export function useAuth(entity?: Instance | Cluster | null): AuthenticatedConnection {
	const [connection, setConnection] = useState<AuthenticatedConnection>({ user: null, isLoading: true });
	useEffect(() =>
		authStore.listenToEntity(entity, connection => {
			setConnection(connection);
		}), [entity]);
	return connection;
}
