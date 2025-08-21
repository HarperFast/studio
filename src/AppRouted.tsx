import { ErrorComponent } from '@/components/ErrorComponent';
import { NotFoundComponent } from '@/components/NotFoundComponent';
import { useRootAuthenticationContext } from '@/hooks/useAuth';
import { queryClient } from '@/react-query/queryClient';
import { rootRouteTree } from '@/router/rootRouteTree';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/router-devtools';

export function AppRouted() {
	const authentication = useRootAuthenticationContext();
	const router = createRouter({
		routeTree: rootRouteTree,
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
	return (
		<>
			<RouterProvider router={router} context={{ authentication }} />
			{import.meta.env.DEV && <TanStackRouterDevtools router={router} />}
		</>
	);
}
