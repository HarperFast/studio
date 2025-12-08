import { ConfigIndex } from '@/features/instance/config/index';
import { ConfigOverviewIndex } from '@/features/instance/config/overview';
import { ConfigRolesIndex } from '@/features/instance/config/roles';
import { ConfigSSHKeysIndex } from '@/features/instance/config/sshKeys';
import { ConfigUsersIndex } from '@/features/instance/config/users';
import { createInstanceLayoutRoute } from '@/features/instance/instanceLayoutRoute';
import { registrationInfoLoader } from '@/features/instance/registrationInfoLoader';
import { createRoute } from '@tanstack/react-router';

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
		loader: registrationInfoLoader,
	});

	const instanceConfigRolesRoute = createRoute({
		getParentRoute: () => instanceConfigRoute,
		path: 'roles',
		component: ConfigRolesIndex,
	});
	const instanceConfigRoleRoute = createRoute({
		getParentRoute: () => instanceConfigRoute,
		path: 'roles/$roleId',
		component: ConfigRolesIndex,
	});

	const instanceConfigUsersRoute = createRoute({
		getParentRoute: () => instanceConfigRoute,
		path: 'users',
		component: ConfigUsersIndex,
	});
	const instanceConfigUserRoute = createRoute({
		getParentRoute: () => instanceConfigRoute,
		path: 'users/$username',
		component: ConfigUsersIndex,
	});

	const instanceConfigSSHKeysRoute = createRoute({
		getParentRoute: () => instanceConfigRoute,
		path: 'ssh-keys',
		component: ConfigSSHKeysIndex,
	});
	const instanceConfigSSHKeyRoute = createRoute({
		getParentRoute: () => instanceConfigRoute,
		path: 'ssh-keys/$keyName',
		component: ConfigSSHKeysIndex,
	});

	return instanceConfigRoute.addChildren([
		instanceOverviewRoute,

		instanceConfigRolesRoute,
		instanceConfigRoleRoute,

		instanceConfigUsersRoute,
		instanceConfigUserRoute,

		instanceConfigSSHKeysRoute,
		instanceConfigSSHKeyRoute,
	]);
}
