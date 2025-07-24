import { createRoute } from '@tanstack/react-router';
import { orgsLayoutRoute } from '@/features/organizations/routes';
import { getOrganizationQueryOptions } from '@/features/organization/queries/getOrganizationQuery';
import { OrganizationLayout } from '@/features/organization/OrganizationLayout';
import { OrganizationIndex } from '@/features/organization/index';
import { OrgConfigRolesIndex } from '@/features/organization/roles';

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

export const orgRoutes = [orgIndexRoute, orgRolesRoute, orgRoleRoute];
