import { createInstanceLayoutRoute } from '@/features/instance/instanceLayoutRoute';
import { createRoute, lazyRouteComponent } from '@tanstack/react-router';

export function createStatusRouteTree(instanceLayoutRoute: ReturnType<typeof createInstanceLayoutRoute>) {
	const instanceConfigRoute = createRoute({
		getParentRoute: () => instanceLayoutRoute,
		path: 'status',
		component: lazyRouteComponent(async () => import('@/features/instance/status/index'), 'StatusIndex'),
	});
	return instanceConfigRoute;
}
