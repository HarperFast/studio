import { isLocalStudio } from '@/config/constants';
import { rootRoute } from '@/router/rootRoute';
import { authRouteTree, localAuthRouteTree } from '@/features/auth/routes';
import { dashboardLayout } from '@/router/dashboardRoute';
import { instanceLayoutRoute, instanceRouteTree } from '@/features/instance/routes';
import { profileRouteTree } from '@/features/profile/routes';
import { orgsLayoutRoute, orgsRouteTree } from '@/features/organizations/routes';
import { orgLayoutRoute, orgRouteTree } from '@/features/organization/routes';
import { clustersLayoutRoute, clustersRouteTree } from '@/features/clusters/routes';
import { clusterLayoutRoute, clusterRouteTree } from '@/features/cluster/routes';

export const rootRouteTree = isLocalStudio
	? rootRoute.addChildren([
		...localAuthRouteTree,
		dashboardLayout.addChildren([
			instanceLayoutRoute.addChildren([
				...instanceRouteTree,
			]),
		]),
	])
	: rootRoute.addChildren([
		authRouteTree,
		dashboardLayout.addChildren([
			...profileRouteTree,
			orgsLayoutRoute.addChildren([
				...orgsRouteTree,
				orgLayoutRoute.addChildren([
					...orgRouteTree,
					clustersLayoutRoute.addChildren([
						...clustersRouteTree,
						clusterLayoutRoute.addChildren([
							...clusterRouteTree,
							instanceLayoutRoute.addChildren([
								...instanceRouteTree,
							]),
						]),
					]),
				]),
			]),
		]),
	]);
