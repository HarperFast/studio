import { useEffect, useMemo, useState } from 'react';
import { isLocalStudio } from '@/config/constants';
import { isInstance } from '@/lib/types/isInstance';
import { isCluster } from '@/lib/types/isCluster';
import { AuthenticatedConnection, AuthenticatedConnectionKey, authStore } from '@/lib/authStore';
import { Cluster, Instance } from '@/lib/api.patch';
import { getOperationsUrlForInstance } from '@/lib/getOperationsUrlForInstance';

export function useAuth(): AuthenticatedConnection;
export function useAuth(entity: Instance | Cluster | null): AuthenticatedConnection;
export function useAuth(entity?: Instance | Cluster | null): AuthenticatedConnection {
	const key = useMemo(() =>
		calculateKeyFromEntity(entity), [entity]);
	const [connection, setConnection] = useState<AuthenticatedConnection>({ user: null, isLoading: true });
	useEffect(() =>
		authStore.listenToKey(key, connection => {
			setConnection(connection);
		}), [key]);
	return connection;
}

function calculateKeyFromEntity(entity?: Instance | Cluster | null): AuthenticatedConnectionKey | undefined {
	if (isLocalStudio || entity === undefined) {
		return 'global';
	}
	if (isInstance(entity)) {
		return getOperationsUrlForInstance(entity);
	}
	if (isCluster(entity)) {
		// TODO: Do we need to add the port and other stuff to the fqdn for the cluster like we did for an instance?
		return entity.fqdn;
	}
	return undefined;
}
