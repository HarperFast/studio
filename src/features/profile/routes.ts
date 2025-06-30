// import { type RouteConfig, index, prefix, route } from '@react-router/dev/routes';

// const profileRoutes: RouteConfig = [
// 	...prefix('profile', [
// 		index('./features/profile/index.tsx'),
// 		route('update', './features/profile/UpdateProfile.tsx'), // Modal
// 	]),
// ];

// export default [...profileRoutes];
import { createRoute, lazyRouteComponent } from '@tanstack/react-router';
import { dashboardLayout } from '@/router/dashboard-route';

const profileRoute = createRoute({
	getParentRoute: () => dashboardLayout,
	path: 'profile',
	component: lazyRouteComponent(async () => import('@/features/profile/index'), 'ProfileIndex'),
});

export const profileRouteTree = [profileRoute];
