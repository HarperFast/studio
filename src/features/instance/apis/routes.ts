import { createInstanceLayoutRoute } from '@/features/instance/instanceLayoutRoute';
import { createRoute } from '@tanstack/react-router';

export function createAPIsRouteTree(instanceLayoutRoute: ReturnType<typeof createInstanceLayoutRoute>) {
	return createRoute({
		getParentRoute: () => instanceLayoutRoute,
		path: 'apis',
		head: () => ({ meta: [{ title: 'APIs — Harper Fabric' }] }),
	}).lazy(() => import('./index.lazy').then((d) => d.route));
}
