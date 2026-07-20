import { isLocalStudio } from '@/config/constants';
import { adminLayoutRoute, adminRoutes } from '@/features/admin/routes';
import { authRouteTree, localAuthRoutes } from '@/features/auth/routes';
import { clusterLayoutRoute } from '@/features/cluster/clusterLayoutRoute';
import { clusterRoutes } from '@/features/cluster/routes';
import { clusterEditRoutes, clustersLayoutRoute, clustersRoutes, newClusterRoute } from '@/features/clusters/routes';
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
			adminLayoutRoute.addChildren([...adminRoutes]),
			orgsLayoutRoute.addChildren([
				...orgsRoutes,
				orgLayoutRoute.addChildren([
					...orgRoutes,
					newClusterRoute,
					clustersLayoutRoute.addChildren([
						...clustersRoutes,
						clusterLayoutRoute.addChildren([
							...clusterRoutes,
							...clusterEditRoutes,
							// Every route nested under clusterLayoutRoute must also be wired in here,
							// because each declares `getParentRoute: () => clusterLayoutRoute`. Mounting
							// any of them a level up (under clustersLayoutRoute) makes its declared parent
							// a sibling, which TanStack Router 1.170 resolves into a corrupted route tree
							// (path params mis-parsed, `organizationId` lost → /Organization/undefined).
							createInstanceRouteTree('cluster'),
							createInstanceRouteTree('instance'),
						]),
					]),
				]),
			]),
		]),
	]);
