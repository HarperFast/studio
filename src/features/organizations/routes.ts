import { createRoute } from '@tanstack/react-router';
import { dashboardLayout } from '@/router/dashboardRoute';
import { OrganizationsLayout } from '@/features/organizations/OrganizationsLayout';
import { OrganizationsIndex } from '@/features/organizations/index';

export const orgsLayoutRoute = createRoute({
	getParentRoute: () => dashboardLayout,
	path: 'orgs',
	component: OrganizationsLayout,
});

const orgsIndexRoute = createRoute({
	getParentRoute: () => orgsLayoutRoute,
	path: '/',
	component: OrganizationsIndex,
});

export const orgsRouteTree = [orgsIndexRoute];
