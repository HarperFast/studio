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

// Parent: adminLayoutRoute (keep in lockstep with rootRouteTree's addChildren).
export const adminRoutes = [apiTokenRoute];
