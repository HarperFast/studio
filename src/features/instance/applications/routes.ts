import { createInstanceLayoutRoute } from '@/features/instance/instanceLayoutRoute';
import { createRoute, lazyRouteComponent } from '@tanstack/react-router';

export function createApplicationsRoutes(
	instanceLayoutRoute: ReturnType<typeof createInstanceLayoutRoute>,
	mode: 'local' | 'cluster' | 'instance',
) {
	const instanceApplicationsIndexRoute = createRoute({
		getParentRoute: () => instanceLayoutRoute,
		// In cluster mode the bare cluster index is the cluster home (see ClusterHome); Applications
		// moves to /apps. Local and instance modes keep Applications as their index.
		path: mode === 'cluster' ? 'apps' : '/',
		head: () => ({ meta: [{ title: 'Applications — Harper Fabric' }] }),
		// Lazy: the applications editor pulls in Monaco, the AI SDK, motion and
		// react-markdown. Loading it on demand keeps all of that off first paint.
		component: lazyRouteComponent(() => import('@/features/instance/applications'), 'ApplicationsEditor'),
	});

	return [
		instanceApplicationsIndexRoute,
	];
}
