import { dashboardLayout } from '@/router/dashboardRoute';
import { createRoute, lazyRouteComponent } from '@tanstack/react-router';

const notificationsRoute = createRoute({
	getParentRoute: () => dashboardLayout,
	path: 'notifications',
	head: () => ({ meta: [{ title: 'Notifications — Harper Fabric' }] }),
	component: lazyRouteComponent(async () => import('@/features/notifications/index'), 'NotificationsCenter'),
});

// Parent: dashboardLayout (keep in lockstep with rootRouteTree's addChildren).
export const notificationsRoutes = [notificationsRoute];
