import { createInstanceLayoutRoute } from '@/features/instance/instanceLayoutRoute';
import { Logs } from '@/features/instance/log/index';
import { validateLogSearch } from '@/features/instance/log/logView';
import { createRoute } from '@tanstack/react-router';

export function createLogRouteTree(instanceLayoutRoute: ReturnType<typeof createInstanceLayoutRoute>) {
	return createRoute({
		getParentRoute: () => instanceLayoutRoute,
		path: 'logs',
		validateSearch: validateLogSearch,
		head: () => ({ meta: [{ title: 'Logs — Harper Fabric' }] }),
		component: Logs,
	});
}
