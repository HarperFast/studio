import { createRoute } from '@tanstack/react-router';
import { clustersLayoutRoute } from '@/features/clusters/routes';
import { ClusterLayout } from '@/features/cluster/ClusterLayout';
import { getClusterInfoQueryOptions } from '@/features/cluster/queries/getClusterInfoQuery';
import { ClusterIndex } from '@/features/cluster/index';

export const clusterLayoutRoute = createRoute({
	getParentRoute: () => clustersLayoutRoute,
	path: '$clusterId',
	component: ClusterLayout,
	loader: ({ context, params }) => {
		context.queryClient.ensureQueryData(getClusterInfoQueryOptions(params.clusterId));
	},
});

const clusterIndexRoute = createRoute({
	getParentRoute: () => clusterLayoutRoute,
	path: '/',
	component: ClusterIndex,
	// loader: ({ context, params }) => {
	// 	context.ClusterAuthContext.checkAuth(params.clusterId);
	// },
});

export const clusterRouteTree = [
	clusterIndexRoute,
];
