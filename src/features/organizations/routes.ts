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
	head: () => ({ meta: [{ title: 'Organizations — Harper Fabric' }] }),
	component: OrganizationsIndex,
});

const newOrgRoute = createRoute({
	getParentRoute: () => orgsLayoutRoute,
	path: '/new-org',
	head: () => ({ meta: [{ title: 'New Organization — Harper Fabric' }] }),
	component: NewOrg,
});

export const orgsRoutes = [
	orgsIndexRoute,
	newOrgRoute,
];
