import { ClusterLayout } from '@/features/cluster/ClusterLayout';
import { getClusterInfoQueryOptions } from '@/features/cluster/queries/getClusterInfoQuery';
import { clustersLayoutRoute } from '@/features/clusters/routes';
import { createRoute } from '@tanstack/react-router';

export const clusterLayoutRoute = createRoute({
	getParentRoute: () => clustersLayoutRoute,
	path: '$clusterId',
	component: ClusterLayout,
	beforeLoad: async ({ context, params }) => {
		return {
			cluster: await context.queryClient.ensureQueryData(getClusterInfoQueryOptions(params.clusterId)),
		};
	},
});
