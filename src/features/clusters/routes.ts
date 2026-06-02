import { clusterLayoutRoute } from '@/features/cluster/clusterLayoutRoute';
import { ClustersList as ClusterList } from '@/features/clusters/ClustersList';
import { UpsertCluster } from '@/features/clusters/upsert';
import { orgLayoutRoute } from '@/features/organization/routes';
import { createRoute } from '@tanstack/react-router';

export const clustersLayoutRoute = createRoute({
	getParentRoute: () => orgLayoutRoute,
	id: '_clusterLayout',
});

const clustersIndexRoute = createRoute({
	getParentRoute: () => clustersLayoutRoute,
	path: '/',
	head: () => ({ meta: [{ title: 'Clusters — Harper Fabric' }] }),
	component: ClusterList,
});

const newClusterRoute = createRoute({
	getParentRoute: () => orgLayoutRoute,
	path: '/new-cluster',
	head: () => ({ meta: [{ title: 'New Cluster — Harper Fabric' }] }),
	component: UpsertCluster,
});

const editClusterRoute = createRoute({
	getParentRoute: () => clusterLayoutRoute,
	path: '/edit',
	head: () => ({ meta: [{ title: 'Edit Cluster — Harper Fabric' }] }),
	component: UpsertCluster,
});

const editClusterVersionRoute = createRoute({
	getParentRoute: () => clusterLayoutRoute,
	path: '/edit/$mode',
	head: () => ({ meta: [{ title: 'Edit Cluster — Harper Fabric' }] }),
	component: UpsertCluster,
});

// Each route must be wired into the tree (in rootRouteTree) under the same route
// its `getParentRoute` declares — otherwise TanStack Router 1.170 mis-parses the
// tree and drops path params. So these are grouped by their declared parent.

// Parent: clustersLayoutRoute
export const clustersRoutes = [
	clustersIndexRoute,
];

// Parent: orgLayoutRoute
export { newClusterRoute };

// Parent: clusterLayoutRoute
export const clusterEditRoutes = [
	editClusterRoute,
	editClusterVersionRoute,
];
