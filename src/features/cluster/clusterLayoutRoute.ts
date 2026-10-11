import { clustersLayoutRoute } from '@/features/clusters/routes';
import { ensureRouteQueryData } from '@/router/ensureRouteQueryData';
import { createRoute } from '@tanstack/react-router';
import { ClusterLayout } from './ClusterLayout';
import { ClusterRouteError } from './components/ClusterRouteError';
import { getClusterInfoQueryOptions } from './queries/getClusterInfoQuery';

export const clusterLayoutRoute = createRoute({
	getParentRoute: () => clustersLayoutRoute,
	path: '$clusterId',
	component: ClusterLayout,
	errorComponent: ClusterRouteError,
	beforeLoad: async (opts) => {
		return {
			cluster: await ensureRouteQueryData(opts, getClusterInfoQueryOptions(opts.params.clusterId)),
		};
	},
});
