import { createInstanceLayoutRoute } from '@/features/instance/instanceLayoutRoute';
import { Logs } from '@/features/instance/log/index';
import { createRoute } from '@tanstack/react-router';

export function createLogRouteTree(instanceLayoutRoute: ReturnType<typeof createInstanceLayoutRoute>) {
	return createRoute({
		getParentRoute: () => instanceLayoutRoute,
		path: 'logs',
		component: Logs,
	});
}
