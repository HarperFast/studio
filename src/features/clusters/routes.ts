import { createRoute } from '@tanstack/react-router';
import { ClustersLayoutComponent } from '@/features/clusters/index';
import { ClustersList as ClusterList } from '@/features/clusters/ClustersList';
import { orgLayoutRoute } from '@/features/organization/routes';

export const clustersLayoutRoute = createRoute({
	getParentRoute: () => orgLayoutRoute,
	path: 'clusters',
	component: ClustersLayoutComponent,
});

const clustersIndexRoute = createRoute({
	getParentRoute: () => clustersLayoutRoute,
	path: '/',
	component: ClusterList,
});

export const clustersRouteTree = [
	clustersIndexRoute,
];
