import { useAuth } from '@/hooks/useAuth';
import { createHashHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { rootRouteTree } from '@/router/rootRouteTree';
import { NotFoundComponent } from '@/components/NotFoundComponent';
import { ErrorComponent } from '@/components/ErrorComponent';
import { queryClient } from '@/react-query/queryClient';
import { TanStackRouterDevtools } from '@tanstack/router-devtools';

export function AppRouted() {
	const authentication = useAuth();
	const hashHistory = createHashHistory();
	const router = createRouter({
		routeTree: rootRouteTree,
		history: hashHistory,
		defaultNotFoundComponent: NotFoundComponent,
		defaultErrorComponent: ErrorComponent,
		defaultPreload: 'intent',
		// Since we're using React Query, we don't want loader calls to ever be stale
		// This will ensure that the loader is always called when the route is preloaded or visited
		defaultPreloadStaleTime: 0,
		scrollRestoration: true,
		context: {
			queryClient,
			authentication,
		},
	});
	return <>
		<RouterProvider router={router} context={{ authentication }} />
		<TanStackRouterDevtools router={router} />
	</>;
}
