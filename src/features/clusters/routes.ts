import { ClustersList as ClusterList } from '@/features/clusters/ClustersList';
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

export const clustersRoutes = [
	clustersIndexRoute,
];
