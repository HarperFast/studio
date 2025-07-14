import { isLocalStudio } from '@/config/constants';
import { rootRoute } from '@/router/rootRoute';
import { authRouteTree, localAuthRoutes } from '@/features/auth/routes';
import { dashboardLayout } from '@/router/dashboardRoute';
import { createInstanceRouteTree } from '@/features/instance/routes';
import { orgsLayoutRoute, orgsRoutes } from '@/features/organizations/routes';
import { orgLayoutRoute, orgRoutes } from '@/features/organization/routes';
import { clustersLayoutRoute, clustersRoutes } from '@/features/clusters/routes';
import { clusterLayoutRoute, clusterRoutes } from '@/features/cluster/routes';
import { profileRoutes } from '@/features/profile/routes';

export const rootRouteTree = isLocalStudio
	? rootRoute.addChildren([
		...localAuthRoutes,
		dashboardLayout.addChildren([
			createInstanceRouteTree('local'),
		]),
	])
	: rootRoute.addChildren([
		authRouteTree,
		dashboardLayout.addChildren([
			...profileRoutes,
			orgsLayoutRoute.addChildren([
				...orgsRoutes,
				orgLayoutRoute.addChildren([
					...orgRoutes,
					clustersLayoutRoute.addChildren([
						...clustersRoutes,
						createInstanceRouteTree('cluster'),
						clusterLayoutRoute.addChildren([
							...clusterRoutes,
							createInstanceRouteTree('instance'),
						]),
					]),
				]),
			]),
		]),
	]);
