import { ErrorComponent } from '@/components/ErrorComponent';
import { NotFoundComponent } from '@/components/NotFoundComponent';
import { useRootAuthenticationContext } from '@/hooks/useAuth';
import { browserIsTouchBased } from '@/lib/browserIsTouchBased';
import { queryClient } from '@/react-query/queryClient';
import { rootRouteTree } from '@/router/rootRouteTree';
import { createHashHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';

export function AppRouted() {
	const authentication = useRootAuthenticationContext();
	const hashHistory = createHashHistory();
	const router = createRouter({
		routeTree: rootRouteTree,
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
			authentication,
		},
	});
	return (
		<>
			<RouterProvider router={router} context={{ authentication }} />
			{import.meta.env.DEV && <TanStackRouterDevtools router={router} />}
		</>
	);
}
