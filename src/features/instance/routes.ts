import { createStatusRouteTree } from '@/features/instance/status/routes';
import { createRoute } from '@tanstack/react-router';
import { Browse } from '@/features/instance/browse';
import { createInstanceLayoutRoute } from '@/features/instance/instanceLayoutRoute';
import { createConfigRouteTree } from '@/features/instance/config/routes';
import { createBrowseRouteTree } from '@/features/instance/browse/routes';
import { createApplicationsRoutes } from '@/features/instance/applications/routes';
import { createLogRouteTree } from '@/features/instance/log/routes';

export function createInstanceRouteTree(mode: 'local' | 'cluster' | 'instance') {
	const instanceLayoutRoute = createInstanceLayoutRoute(mode);

	const instanceIndexRoute = createRoute({
		getParentRoute: () => instanceLayoutRoute,
		path: mode === 'cluster' ? '/index' : '/',
		component: Browse,
	});

	const children = [
		instanceIndexRoute,
		createLogRouteTree(instanceLayoutRoute),
		...createApplicationsRoutes(instanceLayoutRoute),
		createStatusRouteTree(instanceLayoutRoute),
		createConfigRouteTree(instanceLayoutRoute),
		createBrowseRouteTree(instanceLayoutRoute),
	];

	return instanceLayoutRoute.addChildren(children);
}
