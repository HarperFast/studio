import { authStore, OverallAppSignIn } from '@/features/auth/store/authStore';
import { claimForRoute } from '@/react-query/routeQueryClaims';
import { DefaultError, EnsureQueryDataOptions, isCancelledError, QueryClient, QueryKey } from '@tanstack/react-query';

export interface RouteLoad {
	context: { queryClient: QueryClient };
	abortController: AbortController;
	preload: boolean;
}

/**
 * `queryClient.ensureQueryData` for a route's `beforeLoad` or `loader`, given that function's own arguments.
 *
 * When the read has to fetch, its failure is the route's to show and report — the route's error component
 * and the root `onCaughtError` — so the global query error handler stays out (`src/router/DESIGN.md`). A
 * preload renders nothing and keeps the global handling. A caller that catches the rejection takes on
 * reporting it.
 *
 * A sign-out clears the query cache, which rejects every fetch still in flight with `CancelledError`
 * before the signed-out state reaches the router's guards; thrown from a route, that renders as the
 * route's error. A cancellation a sign-out caused therefore never settles: the router races every
 * `beforeLoad` and `loader` against its own abort signal, and the guards' redirect aborts this load.
 */
export async function ensureRouteQueryData<
	TQueryFnData,
	TError = DefaultError,
	TData = TQueryFnData,
	TQueryKey extends QueryKey = QueryKey,
>(
	route: RouteLoad,
	options: EnsureQueryDataOptions<TQueryFnData, TError, TData, TQueryKey>,
): Promise<TData> {
	const { queryClient } = route.context;
	const signOutGeneration = authStore.getSignOutGeneration(OverallAppSignIn);
	let release: (() => void) | undefined;
	if (!route.preload) {
		const query = queryClient.getQueryCache().build(queryClient, queryClient.defaultQueryOptions(options));
		if (query.state.data === undefined) {
			release = claimForRoute(query, route.abortController.signal);
		}
	}
	try {
		return await queryClient.ensureQueryData(options);
	} catch (error) {
		if (isCancelledError(error) && authStore.getSignOutGeneration(OverallAppSignIn) !== signOutGeneration) {
			return new Promise<never>(() => undefined);
		}
		throw error;
	} finally {
		release?.();
	}
}
