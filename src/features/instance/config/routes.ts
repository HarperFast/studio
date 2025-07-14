import { createRoute } from '@tanstack/react-router';
import { ConfigIndex } from '@/features/instance/config/index';
import { ConfigOverviewIndex } from '@/features/instance/config/overview';
import { ConfigRolesIndex } from '@/features/instance/config/roles';
import { ConfigUsersIndex } from '@/features/instance/config/users';
import { createInstanceLayoutRoute } from '@/features/instance/instanceLayoutRoute';

export function createConfigRouteTree(instanceLayoutRoute: ReturnType<typeof createInstanceLayoutRoute>) {
	const instanceConfigRoute = createRoute({
		getParentRoute: () => instanceLayoutRoute,
		path: 'config',
		component: ConfigIndex,
	});
	const instanceOverviewRoute = createRoute({
		getParentRoute: () => instanceConfigRoute,
		path: '/',
		component: ConfigOverviewIndex,
	});
	const instanceConfigRolesRoute = createRoute({
		getParentRoute: () => instanceConfigRoute,
		path: 'roles',
		component: ConfigRolesIndex,
	});
	const instanceConfigUsersRoute = createRoute({
		getParentRoute: () => instanceConfigRoute,
		path: 'users',
		component: ConfigUsersIndex,
	});

	return instanceConfigRoute.addChildren([
		instanceOverviewRoute,
		instanceConfigRolesRoute,
		instanceConfigUsersRoute,
	]);
}
