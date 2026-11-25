import type { QueryClient } from '@tanstack/react-query';

/**
 * Drops what was read through an entity's (instance or cluster) sign-in once it ends, so the next sign-in to it starts
 * empty rather than from the previous session's results. Removing a query cancels a read still out for it, silently:
 * the read rejects instead of landing in the cache or resolving to its caller. Not `cancelQueries` first: its default
 * `revert` resolves a read whose query already held data with that data, the previous session's.
 *
 * - The id may sit anywhere in the key. Most keys lead with it or put it after the operation (`invalidateEntityQueries`),
 *   but `read_log`'s carries it fifth.
 * - Central manager's own records of the entity are kept (`meta: { keptOnEntitySignOut: true }`): they are read with
 *   the app's sign-in, and the cluster's pages and route loaders read them whether or not the entity is signed in.
 * - So is a query a mounted component is reading. Removed, its observer stays on the dropped query, stuck `fetching`
 *   if a read was out, until it renders again; the full sign-out can clear those because it navigates away.
 *
 * Never throws: it runs inside a sign-out, which must finish.
 */
export function removeEntityQueries(queryClient: QueryClient, entityId: string): void {
	try {
		queryClient.removeQueries({
			type: 'inactive',
			predicate: (query) => query.queryKey.includes(entityId) && !query.meta?.keptOnEntitySignOut,
		});
	} catch (error) {
		console.error(error);
	}
}
