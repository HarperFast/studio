import { ErrorComponent } from '@/components/ErrorComponent';
import { NotFoundComponent } from '@/components/NotFoundComponent';
import { AuthenticatedConnection, EntityIds } from '@/features/auth/store/authStore';
import { browserIsTouchBased } from '@/lib/browserIsTouchBased';
import { queryClient } from '@/react-query/queryClient';
import { rootRouteTree } from '@/router/rootRouteTree';
import { createHashHistory, createRouter } from '@tanstack/react-router';

export function useNewRouter({ routeTree = rootRouteTree, authentication }: {
	routeTree?: typeof rootRouteTree;
	authentication?: Record<EntityIds, AuthenticatedConnection>
}) {
	const hashHistory = createHashHistory();
	return createRouter({
		routeTree,
		history: hashHistory,
		defaultNotFoundComponent: NotFoundComponent,
		defaultErrorComponent: ErrorComponent,
		defaultPreload: browserIsTouchBased() ? false : 'intent',
		trailingSlash: 'never',
		// Since we're using React Query, we don't want loader calls to ever be stale
		// This will ensure that the loader is always called when the route is preloaded or visited
		defaultPreloadStaleTime: 0,
		scrollRestoration: true,
		context: {
			queryClient,
			authentication: authentication || {},
		},
	});
}
