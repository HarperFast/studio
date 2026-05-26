import { dashboardLayout } from '@/router/dashboardRoute';
import { createRoute, lazyRouteComponent } from '@tanstack/react-router';

const profileRoute = createRoute({
	getParentRoute: () => dashboardLayout,
	path: 'profile',
	head: () => ({ meta: [{ title: 'Profile — Harper Fabric' }] }),
	component: lazyRouteComponent(async () => import('@/features/profile/index'), 'ProfileIndex'),
});

export const profileRoutes = [profileRoute];
