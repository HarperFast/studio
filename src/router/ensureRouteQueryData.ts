import { authStore, OverallAppSignIn } from '@/features/auth/store/authStore';
import { DefaultError, EnsureQueryDataOptions, isCancelledError, QueryClient, QueryKey } from '@tanstack/react-query';

/**
 * `queryClient.ensureQueryData` for a route's `beforeLoad` or `loader`.
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
	queryClient: QueryClient,
	options: EnsureQueryDataOptions<TQueryFnData, TError, TData, TQueryKey>,
): Promise<TData> {
	const signOutGeneration = authStore.getSignOutGeneration(OverallAppSignIn);
	try {
		return await queryClient.ensureQueryData(options);
	} catch (error) {
		if (isCancelledError(error) && authStore.getSignOutGeneration(OverallAppSignIn) !== signOutGeneration) {
			return new Promise<never>(() => undefined);
		}
		throw error;
	}
}
