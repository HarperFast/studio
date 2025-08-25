import { ClustersList as ClusterList } from '@/features/clusters/ClustersList';
import { EditCluster } from '@/features/clusters/EditCluster';
import { orgLayoutRoute } from '@/features/organization/routes';
import { createRoute } from '@tanstack/react-router';

export const clustersLayoutRoute = createRoute({
	getParentRoute: () => orgLayoutRoute,
	id: '_orgLayout',
});

const clustersIndexRoute = createRoute({
	getParentRoute: () => clustersLayoutRoute,
	path: '/',
	component: ClusterList,
});

const newClusterRoute = createRoute({
	getParentRoute: () => orgLayoutRoute,
	path: '/new-cluster',
	component: EditCluster,
});

const editClusterRoute = createRoute({
	getParentRoute: () => orgLayoutRoute,
	path: '$clusterId/edit',
	component: EditCluster,
});

export const clustersRoutes = [
	clustersIndexRoute,
	newClusterRoute,
	editClusterRoute,
];
