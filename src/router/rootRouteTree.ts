import { isLocalStudio } from '@/config/constants';
import { authRouteTree, localAuthRoutes } from '@/features/auth/routes';
import { clusterLayoutRoute } from '@/features/cluster/clusterLayoutRoute';
import { clusterRoutes } from '@/features/cluster/routes';
import { clustersLayoutRoute, clustersRoutes } from '@/features/clusters/routes';
import { createInstanceRouteTree } from '@/features/instance/routes';
import { orgLayoutRoute, orgRoutes } from '@/features/organization/routes';
import { orgsLayoutRoute, orgsRoutes } from '@/features/organizations/routes';
import { profileRoutes } from '@/features/profile/routes';
import { dashboardLayout } from '@/router/dashboardRoute';
import { rootRoute } from '@/router/rootRoute';

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
