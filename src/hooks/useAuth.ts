import { SchemaCluster, SchemaHdbInstance } from '@/lib/api.gen';
import { useEffect, useMemo, useState } from 'react';
import { isLocalStudio } from '@/config/constants';
import { isHDBInstance } from '@/lib/types/isHDBInstance';
import { isCluster } from '@/lib/types/isCluster';
import { AuthenticatedConnection, AuthenticatedConnectionKey, authStore } from '@/lib/authStore';

export function useAuth(): AuthenticatedConnection;
export function useAuth(entity: SchemaHdbInstance | SchemaCluster | null): AuthenticatedConnection;
export function useAuth(entity?: SchemaHdbInstance | SchemaCluster | null): AuthenticatedConnection {
	const key = useMemo(() =>
		calculateKeyFromEntity(entity), [entity]);
	const [connection, setConnection] = useState<AuthenticatedConnection>({ user: null, isLoading: true });
	useEffect(() =>
		authStore.listenToKey(key, connection => {
			setConnection(connection);
		}), [key]);
	return connection;
}

function calculateKeyFromEntity(entity?: SchemaHdbInstance | SchemaCluster | null): AuthenticatedConnectionKey | undefined {
	if (isLocalStudio || entity === undefined) {
		return 'global';
	}
	if (isHDBInstance(entity)) {
		return entity.instanceFqdn;
	}
	if (isCluster(entity)) {
		return entity.fqdn;
	}
	return undefined;
}
