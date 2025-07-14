import { createInstanceLayoutRoute } from '@/features/instance/instanceLayoutRoute';
import { createRoute } from '@tanstack/react-router';
import { Logs } from '@/features/instance/log/index';

export function createLogRouteTree(instanceLayoutRoute: ReturnType<typeof createInstanceLayoutRoute>) {
	return createRoute({
		getParentRoute: () => instanceLayoutRoute,
		path: 'logs',
		component: Logs,
	});
}
