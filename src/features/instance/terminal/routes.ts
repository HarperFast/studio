import { createInstanceLayoutRoute } from '@/features/instance/instanceLayoutRoute';
import { InstanceTerminal } from '@/features/instance/terminal/index';
import { createRoute } from '@tanstack/react-router';

export function createTerminalRouteTree(instanceLayoutRoute: ReturnType<typeof createInstanceLayoutRoute>) {
	return createRoute({
		getParentRoute: () => instanceLayoutRoute,
		path: 'terminal',
		head: () => ({ meta: [{ title: 'Terminal — Harper Fabric' }] }),
		component: InstanceTerminal,
	});
}
