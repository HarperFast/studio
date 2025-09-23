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
	component: ClusterList,
});

const newClusterRoute = createRoute({
	getParentRoute: () => orgLayoutRoute,
	path: '/new-cluster',
	component: UpsertCluster,
});

const editClusterRoute = createRoute({
	getParentRoute: () => clusterLayoutRoute,
	path: '/edit',
	component: UpsertCluster,
});

export const clustersRoutes = [
	clustersIndexRoute,
	newClusterRoute,
	editClusterRoute,
];
