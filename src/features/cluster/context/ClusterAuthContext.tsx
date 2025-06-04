import { Instance, Cluster, getClusterInfoQueryOptions } from '@/features/cluster/queries/getClusterInfoQuery';
import {
	InstanceLoginCredentials,
	useCreateInstanceLoginMutation,
} from '@/features/instance/operations/mutations/readInstanceLogin';
import { useQuery } from '@tanstack/react-query';
import { createContext, useState, PropsWithChildren, useCallback, useEffect } from 'react';

type ClusterContextValue = {
	isAuthenticated: boolean;
	instances: Instance[];
	clusterId: string | null;
	isLoading: boolean;
	loadCluster: (clusterId: string) => void;
	checkAuth: () => void;
	login: (credentials: InstanceLoginCredentials) => Promise<{ success: boolean; message: string }>;
	logout: () => Promise<boolean>;
	clusters: Map<string, ClusterWithAuth>;
	currentCluster: ClusterWithAuth | undefined;
};

const ClusterAuthContext = createContext<ClusterContextValue | null>(null);

type ClusterWithAuth = Cluster & { isAuthenticated: boolean };

const ClusterProvider = ({ children }: PropsWithChildren) => {
	const [clusterId, setClusterId] = useState<string | null>(null);
	const [clusterData, setClusterData] = useState<Map<string, ClusterWithAuth>>(new Map());
	const { data: clusterInfoQueryData, isLoading } = useQuery(
		getClusterInfoQueryOptions(clusterId ?? '', clusterId != null)
	);

	useEffect(() => {
		if (clusterInfoQueryData && !isLoading) {
			const newData = new Map(clusterData);
			newData.set(clusterInfoQueryData.id, {
				...clusterInfoQueryData,
				isAuthenticated: newData.get(clusterInfoQueryData.id)?.isAuthenticated ?? false,
			});
			setClusterData(newData);
		}
		// Wants to add clusterData but we don't depend on it for changes, just to update our map
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [clusterInfoQueryData, isLoading]);

	const currentCluster = clusterData.get(clusterId ?? '');

	const { mutateAsync: submitInstanceLoginInfo } = useCreateInstanceLoginMutation();

	const login = useCallback(
		async (credentials: InstanceLoginCredentials) => {
			try {
				const response = await submitInstanceLoginInfo(credentials);

				// Logged into one instance, therefore should be logged into all for this cluster
				if (currentCluster) {
					const newData = new Map(clusterData);
					newData.set(currentCluster.id, { ...currentCluster, isAuthenticated: true });
					setClusterData(newData);
				}

				return { success: true, message: response.message };
			} catch (e) {
				return { success: false, message: e instanceof Error ? e?.message : 'An Error Occurred.' };
			}
		},
		[submitInstanceLoginInfo, clusterData, currentCluster]
	);

	const logout = useCallback(async () => {
		// login code here
		return false;
	}, []);

	const checkAuth = useCallback(async () => {
		// check auth with registration info. Check at a cluster level initially, if that's valid, check at an instance level
		return false;
	}, []);

	const setCluster = useCallback((clusterId: string) => setClusterId(clusterId), []);

	const contextValue = {
		isAuthenticated: currentCluster?.isAuthenticated ?? false,
		isLoading,
		loadCluster: setCluster,
		instances: currentCluster?.instances ?? ([] as Instance[]),
		checkAuth,
		login,
		logout,
		clusterId: null,
		clusters: clusterData,
		currentCluster,
	} satisfies ClusterContextValue;

	// All your auth related code goes here
	return <ClusterAuthContext.Provider value={contextValue}>{children}</ClusterAuthContext.Provider>;
};

export { ClusterAuthContext, ClusterProvider };
export type { ClusterContextValue };
