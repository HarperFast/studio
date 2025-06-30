// import { type RouteConfig, index, route } from '@react-router/dev/routes';

// const organizationsRoutes: RouteConfig = [
// 	index('./features/organizations/index.tsx'), // redirects to /app/orgs as base route
// 	route('new', './features/organizations/NewOrg.tsx'), // Modal
// ];

// export default [...organizationsRoutes];

import { createRoute } from '@tanstack/react-router';
import { dashboardLayout } from '@/router/dashboard-route';
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
