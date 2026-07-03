import { ErrorComponent } from '@/components/ErrorComponent';
import { NotFoundComponent } from '@/components/NotFoundComponent';
import { AuthenticatedConnection, EntityIds } from '@/features/auth/store/authStore';
import { browserIsTouchBased } from '@/lib/browserIsTouchBased';
import { queryClient } from '@/react-query/queryClient';
import { rootRouteTree } from '@/router/rootRouteTree';
import { createHashHistory, createRouter } from '@tanstack/react-router';
import { useState } from 'react';

export function useNewRouter({ routeTree = rootRouteTree, authentication }: {
	routeTree?: typeof rootRouteTree;
	authentication?: Record<EntityIds, AuthenticatedConnection>;
}) {
	// The router (and its hash history) must be created exactly once. Every
	// `createHashHistory()` call monkey-patches window.history.pushState/replaceState and can
	// synchronously notify the previous router's history subscriber mid-render, which React
	// reports as "Cannot update a component (Transitioner) while rendering a different
	// component (AppRouted)". `authentication` is only the INITIAL context here — updates flow
	// through the RouterProvider `context` prop and `router.invalidate()` (see AppRouted).
	const [router] = useState(() =>
		createRouter({
			routeTree,
			history: createHashHistory(),
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
		})
	);
	return router;
}
