import { createInstanceLayoutRoute } from '@/features/instance/instanceLayoutRoute';
import { createRoute } from '@tanstack/react-router';

export function createAPIsRouteTree(instanceLayoutRoute: ReturnType<typeof createInstanceLayoutRoute>) {
	return createRoute({
		getParentRoute: () => instanceLayoutRoute,
		path: 'apis',
	}).lazy(() => import('./index.lazy').then((d) => d.route));
}
