import { createBillingRouteTree } from '@/features/organization/billing/routes';
import { getOrganizationQueryOptions } from '@/features/organization/queries/getOrganizationQuery';
import { OrgConfigRolesIndex } from '@/features/organization/roles';
import { OrgConfigUsersIndex } from '@/features/organization/users';
import { orgsLayoutRoute } from '@/features/organizations/routes';
import { createRoute } from '@tanstack/react-router';

export const orgLayoutRoute = createRoute({
	getParentRoute: () => orgsLayoutRoute,
	path: '$organizationId',
	beforeLoad: async (opts) => {
		return {
			organization: await opts.context.queryClient.ensureQueryData(getOrganizationQueryOptions(opts.params.organizationId)),
		};
	},
});

const orgRolesRoute = createRoute({
	getParentRoute: () => orgLayoutRoute,
	path: '/roles',
	component: OrgConfigRolesIndex,
});
const orgRoleRoute = createRoute({
	getParentRoute: () => orgLayoutRoute,
	path: '/roles/$orgRoleId',
	component: OrgConfigRolesIndex,
});

const orgUsersRoute = createRoute({
	getParentRoute: () => orgLayoutRoute,
	path: '/users',
	component: OrgConfigUsersIndex,
});
const orgUserRoute = createRoute({
	getParentRoute: () => orgLayoutRoute,
	path: '/users/$orgUserId',
	component: OrgConfigUsersIndex,
});

export const orgRoutes = [
	createBillingRouteTree(orgLayoutRoute),
	orgRolesRoute,
	orgRoleRoute,
	orgUsersRoute,
	orgUserRoute,
];
