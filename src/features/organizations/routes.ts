import { OrganizationsIndex } from '@/features/organizations/index';
import { NewOrg } from '@/features/organizations/NewOrg';
import { dashboardLayout } from '@/router/dashboardRoute';
import { createRoute } from '@tanstack/react-router';

export const orgsLayoutRoute = createRoute({
	getParentRoute: () => dashboardLayout,
	id: '_orgsLayout',
});

const orgsIndexRoute = createRoute({
	getParentRoute: () => orgsLayoutRoute,
	path: '/',
	component: OrganizationsIndex,
});

const newOrgRoute = createRoute({
	getParentRoute: () => orgsLayoutRoute,
	path: '/new-org',
	component: NewOrg,
});

export const orgsRoutes = [
	orgsIndexRoute,
	newOrgRoute,
];
