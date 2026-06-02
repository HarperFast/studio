import { createBillingRouteTree } from '@/features/organization/billing/routes';
import {
	getOrganizationQueryOptions,
	isValidOrganizationId,
} from '@/features/organization/queries/getOrganizationQuery';
import { OrgConfigRolesIndex } from '@/features/organization/roles';
import { OrgConfigUsersIndex } from '@/features/organization/users';
import { orgsLayoutRoute } from '@/features/organizations/routes';
import { createRoute } from '@tanstack/react-router';

export const orgLayoutRoute = createRoute({
	getParentRoute: () => orgsLayoutRoute,
	path: '$organizationId',
	beforeLoad: async (opts) => {
		const { organizationId } = opts.params;
		// `ensureQueryData` ignores the query's `enabled` flag, so without this guard
		// a stray `/undefined` URL would still fetch `/Organization/undefined`.
		if (!isValidOrganizationId(organizationId)) {
			return {};
		}
		return {
			organization: await opts.context.queryClient.ensureQueryData(
				getOrganizationQueryOptions(organizationId),
			),
		};
	},
});

const orgRolesRoute = createRoute({
	getParentRoute: () => orgLayoutRoute,
	path: '/roles',
	head: () => ({ meta: [{ title: 'Organization Roles — Harper Fabric' }] }),
	component: OrgConfigRolesIndex,
});
const orgRoleRoute = createRoute({
	getParentRoute: () => orgLayoutRoute,
	path: '/roles/$orgRoleId',
	head: () => ({ meta: [{ title: 'Organization Roles — Harper Fabric' }] }),
	component: OrgConfigRolesIndex,
});

const orgUsersRoute = createRoute({
	getParentRoute: () => orgLayoutRoute,
	path: '/users',
	head: () => ({ meta: [{ title: 'Organization Users — Harper Fabric' }] }),
	component: OrgConfigUsersIndex,
});
const orgUserRoute = createRoute({
	getParentRoute: () => orgLayoutRoute,
	path: '/users/$orgUserId',
	head: () => ({ meta: [{ title: 'Organization Users — Harper Fabric' }] }),
	component: OrgConfigUsersIndex,
});

export const orgRoutes = [
	createBillingRouteTree(orgLayoutRoute),
	orgRolesRoute,
	orgRoleRoute,
	orgUsersRoute,
	orgUserRoute,
];
