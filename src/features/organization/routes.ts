import { OrganizationIndex } from '@/features/organization/index';
import { OrganizationLayout } from '@/features/organization/OrganizationLayout';
import { getOrganizationQueryOptions } from '@/features/organization/queries/getOrganizationQuery';
import { OrgConfigRolesIndex } from '@/features/organization/roles';
import { OrgConfigUsersIndex } from '@/features/organization/users';
import { orgsLayoutRoute } from '@/features/organizations/routes';
import { createRoute } from '@tanstack/react-router';

export const orgLayoutRoute = createRoute({
	getParentRoute: () => orgsLayoutRoute,
	path: '$organizationId',
	loader: (opts) => {
		return opts.context.queryClient.ensureQueryData(getOrganizationQueryOptions(opts.params.organizationId));
	},
	component: OrganizationLayout,
});

const orgIndexRoute = createRoute({
	getParentRoute: () => orgLayoutRoute,
	path: '/',
	component: OrganizationIndex,
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
	orgIndexRoute,
	orgRolesRoute,
	orgRoleRoute,
	orgUsersRoute,
	orgUserRoute,
];
