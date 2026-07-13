import { createInstanceLayoutRoute } from '@/features/instance/instanceLayoutRoute';
import { STATUS_SEARCH_DEFAULTS, validateStatusSearch } from '@/features/instance/status/statusSearch';
import { createRoute, lazyRouteComponent, stripSearchParams } from '@tanstack/react-router';

export function createStatusRouteTree(instanceLayoutRoute: ReturnType<typeof createInstanceLayoutRoute>) {
	const instanceConfigRoute = createRoute({
		getParentRoute: () => instanceLayoutRoute,
		path: 'status',
		// tab/range/refresh are validated (and defaulted) here so they are
		// scoped to this route declaratively — sibling routes never see them,
		// and StatusTabs needs no imperative cleanup on unmount. The strip
		// middleware keeps default values out of the URL.
		validateSearch: validateStatusSearch,
		search: { middlewares: [stripSearchParams(STATUS_SEARCH_DEFAULTS)] },
		head: () => ({ meta: [{ title: 'Status — Harper Fabric' }] }),
		component: lazyRouteComponent(async () => import('@/features/instance/status/index'), 'StatusIndex'),
	});
	return instanceConfigRoute;
}
