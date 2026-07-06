import { isLocalStudio } from '@/config/constants';
import {
	AuthenticatedCloudConnection,
	AuthenticatedConnection,
	AuthenticatedInstanceConnection,
	authStore,
	EntityIds,
	OverallAppSignIn,
} from '@/features/auth/store/authStore';
import { User } from '@/integrations/api/api.patch';
import { useParams } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

export function useRootAuthenticationContext(): Record<EntityIds, AuthenticatedConnection> {
	// Copy the store's record: getAllConnections() returns its live internal object, which
	// mutates on every update and would make state comparisons lie.
	const [connections, setConnections] = useState(() => ({ ...authStore.getAllConnections() }));
	// Subscribe exactly once. Re-subscribing per change (the old `[connections]` dep) opened a
	// gap between cleanup and re-subscribe in which updates were silently dropped — sign-out
	// emits a burst (each instance entity, then OverallAppSignIn last), and losing that final
	// event left AppRouted holding a signed-in context, so route guards never re-ran.
	useEffect(() =>
		authStore.listenToAllEntities((connection, id) => {
			setConnections((previous) => ({ ...previous, [id]: connection }));
		}), []);
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

export function useAdminMode(): boolean {
	const { user } = useCloudAuth();
	return isAdminMode(user);
}

export function isAdminMode(user: User | null): boolean {
	return user?.fabricRole === 'fabric_admin' || user?.fabricRole === 'super_user';
}

export function useInstanceAuth(entityId?: EntityIds): AuthenticatedInstanceConnection {
	const key = isLocalStudio ? OverallAppSignIn : entityId;
	const { clusterId, instanceId }: { instanceId?: string; clusterId: string } = useParams({ strict: false });
	const [connection, setConnection] = useState<AuthenticatedConnection>(
		authStore.getConnectionById(key ?? instanceId ?? clusterId),
	);
	useEffect(() => authStore.listenToEntity(key, setConnection), [key]);
	return connection as AuthenticatedInstanceConnection;
}
