import { AdminShell } from '@/features/admin/components/AdminShell';
import { dashboardLayout } from '@/router/dashboardRoute';
import { createRoute, lazyRouteComponent } from '@tanstack/react-router';

export const adminLayoutRoute = createRoute({
	getParentRoute: () => dashboardLayout,
	path: 'admin',
	component: AdminShell,
});

// The index route is whatever sits at the top of AdminShell's rail, so landing on /admin (the
// navbar's Admin link) always opens the first section. Keep the two in step when reordering.
const notificationsAdminRoute = createRoute({
	getParentRoute: () => adminLayoutRoute,
	path: '/',
	head: () => ({ meta: [{ title: 'Notifications — Harper Fabric' }] }),
	component: lazyRouteComponent(async () => import('@/features/admin/notifications/index'), 'NotificationsAdminIndex'),
});

const regionsRoute = createRoute({
	getParentRoute: () => adminLayoutRoute,
	path: 'regions',
	head: () => ({ meta: [{ title: 'Regions — Harper Fabric' }] }),
	component: lazyRouteComponent(async () => import('@/features/admin/regions/index'), 'RegionsIndex'),
});

const apiTokenRoute = createRoute({
	getParentRoute: () => adminLayoutRoute,
	path: 'api-token',
	head: () => ({ meta: [{ title: 'API Token — Harper Fabric' }] }),
	component: lazyRouteComponent(async () => import('@/features/admin/apiToken/index'), 'ApiTokenIndex'),
});

// Parent: adminLayoutRoute (keep in lockstep with rootRouteTree's addChildren).
export const adminRoutes = [notificationsAdminRoute, regionsRoute, apiTokenRoute];
