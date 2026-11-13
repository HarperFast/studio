import { createAPIsRouteTree } from '@/features/instance/apis/routes';
import { createApplicationsRoutes } from '@/features/instance/applications/routes';
import { createConfigRouteTree } from '@/features/instance/config/routes';
import { createBrowseRouteTree } from '@/features/instance/databases/routes';
import {
	createExtensionTabRoute,
	createInstanceStartRoute,
	createPresetSetupRoute,
} from '@/features/instance/extensions/routes';
import { createInstanceLayoutRoute } from '@/features/instance/instanceLayoutRoute';
import { createLogRouteTree } from '@/features/instance/log/routes';
import { createOperationsRouteTree } from '@/features/instance/operations/routes';
import { createStatusRouteTree } from '@/features/instance/status/routes';

export function createInstanceRouteTree(mode: 'local' | 'cluster' | 'instance') {
	const instanceLayoutRoute = createInstanceLayoutRoute(mode);

	const children = [
		createLogRouteTree(instanceLayoutRoute),
		...createApplicationsRoutes(instanceLayoutRoute, mode),
		createAPIsRouteTree(instanceLayoutRoute),
		createOperationsRouteTree(instanceLayoutRoute),
		createStatusRouteTree(instanceLayoutRoute),
		createConfigRouteTree(instanceLayoutRoute),
		createExtensionTabRoute(instanceLayoutRoute),
		createInstanceStartRoute(instanceLayoutRoute),
		createPresetSetupRoute(instanceLayoutRoute),
		createBrowseRouteTree(instanceLayoutRoute),
	];

	return instanceLayoutRoute.addChildren(children);
}
