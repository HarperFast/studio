import { createInstanceLayoutRoute } from '@/features/instance/instanceLayoutRoute';
import { StatusIndex } from '@/features/instance/status/index';
import { createRoute } from '@tanstack/react-router';

export function createStatusRouteTree(instanceLayoutRoute: ReturnType<typeof createInstanceLayoutRoute>) {
	const instanceConfigRoute = createRoute({
		getParentRoute: () => instanceLayoutRoute,
		path: 'status',
		component: StatusIndex,
	});
	return instanceConfigRoute;
}
