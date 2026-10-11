import { createInstanceLayoutRoute } from '@/features/instance/instanceLayoutRoute';
import { createRoute, lazyRouteComponent } from '@tanstack/react-router';

export function createOperationsRouteTree(instanceLayoutRoute: ReturnType<typeof createInstanceLayoutRoute>) {
	return createRoute({
		getParentRoute: () => instanceLayoutRoute,
		path: 'operations',
		head: () => ({ meta: [{ title: 'Operations — Harper Fabric' }] }),
		component: lazyRouteComponent(async () => import('@/features/instance/operations/index'), 'OperationsIndex'),
	});
}
