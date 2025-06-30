import { rootRoute } from '@/router/root-route';
import { authRouteTree } from '@/features/auth/routes';
import { dashboardLayout } from '@/router/dashboard-route';
import { profileRouteTree } from '@/features/profile/routes';
import { orgsLayoutRoute, orgsRouteTree } from '@/features/organizations/routes';
import { orgLayoutRoute, orgRouteTree } from '@/features/organization/routes';
import { clustersLayoutRoute, clustersRouteTree } from '@/features/clusters/routes';
import { clusterLayoutRoute, clusterRouteTree } from '@/features/cluster/routes';
import { instanceLayoutRoute, instanceRouteTree } from '@/features/instance/routes';

export const cloudRouteTree = rootRoute.addChildren([
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
