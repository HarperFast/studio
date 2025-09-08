import { createRoute } from '@tanstack/react-router';
import { dashboardLayout } from '@/router/dashboardRoute';
import { OrganizationsIndex } from '@/features/organizations/index';

export const orgsLayoutRoute = createRoute({
	getParentRoute: () => dashboardLayout,
	id: '_orgsLayout',
});

const orgsIndexRoute = createRoute({
	getParentRoute: () => orgsLayoutRoute,
	path: '/',
	component: OrganizationsIndex,
});

export const orgsRoutes = [orgsIndexRoute];
