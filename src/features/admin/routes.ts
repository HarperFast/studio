import { AdminShell } from '@/features/admin/components/AdminShell';
import { dashboardLayout } from '@/router/dashboardRoute';
import { createRoute, lazyRouteComponent } from '@tanstack/react-router';

export const adminLayoutRoute = createRoute({
	getParentRoute: () => dashboardLayout,
	path: 'admin',
	component: AdminShell,
});

const apiTokenRoute = createRoute({
	getParentRoute: () => adminLayoutRoute,
	path: '/',
	head: () => ({ meta: [{ title: 'API Token — Harper Fabric' }] }),
	component: lazyRouteComponent(async () => import('@/features/admin/apiToken/index'), 'ApiTokenIndex'),
});

const notificationsAdminRoute = createRoute({
	getParentRoute: () => adminLayoutRoute,
	path: '/notifications',
	head: () => ({ meta: [{ title: 'Notifications — Harper Fabric' }] }),
	component: lazyRouteComponent(async () => import('@/features/admin/notifications/index'), 'NotificationsAdminIndex'),
});

// Parent: adminLayoutRoute (keep in lockstep with rootRouteTree's addChildren).
export const adminRoutes = [apiTokenRoute, notificationsAdminRoute];
