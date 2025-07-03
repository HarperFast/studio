import { createRoute, lazyRouteComponent } from '@tanstack/react-router';
import { dashboardLayout } from '@/router/dashboardRoute';

const profileRoute = createRoute({
	getParentRoute: () => dashboardLayout,
	path: 'profile',
	component: lazyRouteComponent(async () => import('@/features/profile/index'), 'ProfileIndex'),
});

export const profileRouteTree = [profileRoute];
