import { ClustersList as ClusterList } from '@/features/clusters/ClustersList';
import { UpsertCluster } from '@/features/clusters/upsert';
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
	component: UpsertCluster,
});

const editClusterRoute = createRoute({
	getParentRoute: () => orgLayoutRoute,
	path: '$clusterId/edit',
	component: UpsertCluster,
});

export const clustersRoutes = [
	clustersIndexRoute,
	newClusterRoute,
	editClusterRoute,
];
