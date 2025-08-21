import { isLocalStudio } from '@/config/constants';
import {
	AuthenticatedCloudConnection,
	AuthenticatedConnection,
	AuthenticatedInstanceConnection,
	authStore,
	EntityIds,
	OverallAppSignIn,
} from '@/lib/authStore';
import { useParams } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

export function useRootAuthenticationContext(): Record<EntityIds, AuthenticatedConnection> {
	const [connections, setConnections] = useState(authStore.getAllConnections());
	useEffect(() => authStore.listenToAllEntities((connection, id) => {
		setConnections({ ...connections, [id]: connection });
	}), [connections]);
	return connections;
}

export function useOverallAuth(): AuthenticatedConnection {
	const id = authStore.calculateIdFromEntity(OverallAppSignIn);
	const [connection, setConnection] = useState<AuthenticatedConnection>(authStore.getConnectionById(OverallAppSignIn));
	useEffect(() => authStore.listenToEntity(id, setConnection), [id]);
	return connection;
}

export function useCloudAuth(): AuthenticatedCloudConnection {
	return useOverallAuth() as AuthenticatedCloudConnection;
}

export function useInstanceAuth(entityId?: EntityIds): AuthenticatedInstanceConnection {
	if (isLocalStudio) {
		entityId = OverallAppSignIn;
	}
	const { clusterId, instanceId }: { instanceId?: string; clusterId: string; } = useParams({ strict: false });
	const [connection, setConnection] = useState<AuthenticatedConnection>(authStore.getConnectionById(entityId ?? instanceId ?? clusterId));
	useEffect(() =>
		authStore.listenToEntity(entityId, setConnection), [entityId]);
	return connection as AuthenticatedInstanceConnection;
}
