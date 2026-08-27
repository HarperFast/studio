import { AdminShell } from '@/features/admin/components/AdminShell';
import { dashboardLayout } from '@/router/dashboardRoute';
import { createRoute, lazyRouteComponent, redirect } from '@tanstack/react-router';

export const adminLayoutRoute = createRoute({
	getParentRoute: () => dashboardLayout,
	path: 'admin',
	component: AdminShell,
});

// /admin itself has no page of its own — send it to whatever sits at the top of AdminShell's rail.
// A redirect rather than a second component mount, so each section keeps exactly one URL (links
// shared before Regions existed still point at /admin/notifications). Keep in step when reordering.
// Accounts that can't see the target page are bounced onward by AdminShell's permission filter.
const adminIndexRoute = createRoute({
	getParentRoute: () => adminLayoutRoute,
	path: '/',
	beforeLoad: () => {
		throw redirect({ to: '/admin/notifications' });
	},
});

const notificationsAdminRoute = createRoute({
	getParentRoute: () => adminLayoutRoute,
	path: 'notifications',
	head: () => ({ meta: [{ title: 'Notifications — Harper Fabric' }] }),
	component: lazyRouteComponent(async () => import('@/features/admin/notifications/index'), 'NotificationsAdminIndex'),
});

const regionsRoute = createRoute({
	getParentRoute: () => adminLayoutRoute,
	path: 'regions',
	head: () => ({ meta: [{ title: 'Regions — Harper Fabric' }] }),
	component: lazyRouteComponent(async () => import('@/features/admin/regions/index'), 'RegionsIndex'),
});

const grantsRoute = createRoute({
	getParentRoute: () => adminLayoutRoute,
	path: 'grants',
	head: () => ({ meta: [{ title: 'Grants — Harper Fabric' }] }),
	component: lazyRouteComponent(async () => import('@/features/admin/grants/index'), 'GrantsAdminIndex'),
});

const apiTokenRoute = createRoute({
	getParentRoute: () => adminLayoutRoute,
	path: 'api-token',
	head: () => ({ meta: [{ title: 'API Token — Harper Fabric' }] }),
	component: lazyRouteComponent(async () => import('@/features/admin/apiToken/index'), 'ApiTokenIndex'),
});

// Parent: adminLayoutRoute (keep in lockstep with rootRouteTree's addChildren).
export const adminRoutes = [adminIndexRoute, notificationsAdminRoute, regionsRoute, grantsRoute, apiTokenRoute];
