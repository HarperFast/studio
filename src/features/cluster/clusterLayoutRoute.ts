import { clustersLayoutRoute } from '@/features/clusters/routes';
import { createRoute } from '@tanstack/react-router';
import { ClusterLayout } from './ClusterLayout';
import { ClusterRouteError } from './components/ClusterRouteError';
import { getClusterInfoQueryOptions } from './queries/getClusterInfoQuery';

export const clusterLayoutRoute = createRoute({
	getParentRoute: () => clustersLayoutRoute,
	path: '$clusterId',
	component: ClusterLayout,
	errorComponent: ClusterRouteError,
	beforeLoad: async ({ context, params }) => {
		return {
			cluster: await context.queryClient.ensureQueryData(getClusterInfoQueryOptions(params.clusterId)),
		};
	},
});
