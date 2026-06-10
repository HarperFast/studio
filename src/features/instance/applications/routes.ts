import { createInstanceLayoutRoute } from '@/features/instance/instanceLayoutRoute';
import { createRoute, lazyRouteComponent } from '@tanstack/react-router';

export function createApplicationsRoutes(instanceLayoutRoute: ReturnType<typeof createInstanceLayoutRoute>) {
	const instanceApplicationsIndexRoute = createRoute({
		getParentRoute: () => instanceLayoutRoute,
		path: '/',
		head: () => ({ meta: [{ title: 'Applications — Harper Fabric' }] }),
		// Lazy: the applications editor pulls in Monaco, the AI SDK, motion and
		// react-markdown. Loading it on demand keeps all of that off first paint.
		component: lazyRouteComponent(() => import('@/features/instance/applications'), 'ApplicationsEditor'),
	});

	return [
		instanceApplicationsIndexRoute,
	];
}
