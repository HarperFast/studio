import { createRoute } from '@tanstack/react-router';
import { orgsLayoutRoute } from '@/features/organizations/routes';
import { getOrganizationQueryOptions } from '@/features/organization/queries/getOrganizationQuery';
import { OrganizationLayout } from '@/features/organization/OrganizationLayout';
import { OrganizationIndex } from '@/features/organization/index';

export const orgLayoutRoute = createRoute({
	getParentRoute: () => orgsLayoutRoute,
	path: '$organizationId',
	loader: (opts) => {
		opts.context.queryClient.ensureQueryData(getOrganizationQueryOptions(opts.params.organizationId));
	},
	component: OrganizationLayout,
});

const orgIndexRoute = createRoute({
	getParentRoute: () => orgLayoutRoute,
	path: '/',
	component: OrganizationIndex,
});

export const orgRouteTree = [orgIndexRoute];
