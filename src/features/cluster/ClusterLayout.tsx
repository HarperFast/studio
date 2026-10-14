import { isDeletedCluster } from '@/config/clusterStatuses';
import { authStore } from '@/features/auth/store/authStore';
import { getClusterInfoQueryOptions } from '@/features/cluster/queries/getClusterInfoQuery';
import { terminatedClusterSignIns } from '@/features/cluster/terminatedClusterSignIns';
import { useQuery } from '@tanstack/react-query';
import { Outlet, useParams } from '@tanstack/react-router';
import { useEffect } from 'react';

export function ClusterLayout() {
	const { clusterId } = useParams({ strict: false }) as { clusterId?: string };
	const { data: cluster } = useQuery({ ...getClusterInfoQueryOptions(clusterId, false), refetchOnMount: false });
	// A string, so a poll that changes other fields doesn't re-run the effect.
	const signIns = cluster && isDeletedCluster(cluster) && cluster.status !== 'TERMINATING'
		? JSON.stringify(terminatedClusterSignIns(cluster))
		: undefined;

	useEffect(() => {
		if (signIns) {
			authStore.signOutEntitiesLocally(JSON.parse(signIns) as string[]);
		}
	}, [signIns]);

	return <Outlet />;
}
