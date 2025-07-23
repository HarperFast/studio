// import { createRoute } from '@tanstack/react-router';
// import { ConfigIndex } from '@/features/instance/config/index';
// import { OrgConfigRolesIndex } from '@/features/organization/config/roles';
// // import { ConfigUsersIndex } from '@/features/organization/config/users';
// import { createInstanceLayoutRoute } from '@/features/instance/instanceLayoutRoute';

// export function createOrganizationConfigRouteTree(
// 	organizationLayoutRoute: ReturnType<typeof createInstanceLayoutRoute>
// ) {
// 	const organizationConfigRoute = createRoute({
// 		getParentRoute: () => organizationLayoutRoute,
// 		path: 'config',
// 		component: ConfigIndex,
// 	});
// 	const organizationOverviewRoute = createRoute({
// 		getParentRoute: () => organizationConfigRoute,
// 		path: '/',
// 		component: OrgConfigRolesIndex,
// 	});
// 	const organizationConfigRolesRoute = createRoute({
// 		getParentRoute: () => organizationConfigRoute,
// 		path: 'roles',
// 		component: OrgConfigRolesIndex,
// 	});
// 	const organizationConfigRoleRoute = createRoute({
// 		getParentRoute: () => organizationConfigRoute,
// 		path: 'roles/$roleId',
// 		component: OrgConfigRolesIndex,
// 	});
// 	// const organizationConfigUsersRoute = createRoute({
// 	// 	getParentRoute: () => organizationConfigRoute,
// 	// 	path: 'users',
// 	// 	component: ConfigUsersIndex,
// 	// });
// 	// const organizationConfigUserRoute = createRoute({
// 	// 	getParentRoute: () => organizationConfigRoute,
// 	// 	path: 'users/$username',
// 	// 	component: ConfigUsersIndex,
// 	// });

// 	return organizationConfigRoute.addChildren([
// 		organizationOverviewRoute,
// 		organizationConfigRolesRoute,
// 		organizationConfigRoleRoute,
// 		// organizationConfigUsersRoute,
// 		// organizationConfigUserRoute,
// 	]);
// }
