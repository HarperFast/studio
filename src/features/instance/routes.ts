import { createApplicationsRoutes } from '@/features/instance/applications/routes';
import { createConfigRouteTree } from '@/features/instance/config/routes';
import { createBrowseRouteTree } from '@/features/instance/databases/routes';
import { createInstanceLayoutRoute } from '@/features/instance/instanceLayoutRoute';
import { createLogRouteTree } from '@/features/instance/log/routes';
import { createStatusRouteTree } from '@/features/instance/status/routes';

export function createInstanceRouteTree(mode: 'local' | 'cluster' | 'instance') {
	const instanceLayoutRoute = createInstanceLayoutRoute(mode);

	const children = [
		createLogRouteTree(instanceLayoutRoute),
		...createApplicationsRoutes(instanceLayoutRoute),
		createStatusRouteTree(instanceLayoutRoute),
		createConfigRouteTree(instanceLayoutRoute),
		createBrowseRouteTree(instanceLayoutRoute),
	];

	return instanceLayoutRoute.addChildren(children);
}
