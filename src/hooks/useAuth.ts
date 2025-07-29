import {
	AuthenticatedCloudConnection,
	AuthenticatedConnection,
	AuthenticatedInstanceConnection,
	authStore,
	InstanceConnectionKey,
	OverallAppSignIn,
} from '@/lib/authStore';
import { useEffect, useState } from 'react';

export function useAuth(): AuthenticatedConnection;
export function useAuth(entity: InstanceConnectionKey): AuthenticatedConnection;
export function useAuth(entity?: InstanceConnectionKey): AuthenticatedConnection {
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

export function useCloudAuth(): AuthenticatedCloudConnection {
	return useAuth() as AuthenticatedCloudConnection;
}

export function useInstanceAuth(entity: InstanceConnectionKey): AuthenticatedInstanceConnection {
	return useAuth(entity) as AuthenticatedInstanceConnection;
}
