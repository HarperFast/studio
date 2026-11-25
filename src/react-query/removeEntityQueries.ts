import type { QueryClient } from '@tanstack/react-query';

/**
 * Drops what was read through an entity's sign-in. Removal cancels a read still out silently, so it rejects rather
 * than landing; `cancelQueries` first would revert, resolving a read whose query held data with that data.
 *
 * - The id can sit anywhere in the key: `read_log` carries it fifth.
 * - Central manager's records of the entity (`meta.keptOnEntitySignOut`) stay: they are read with the app's sign-in.
 * - Inactive queries only: a removed query's mounted observer stays on it, stuck `fetching` if a read was out. The
 *   store sweeps again at the entity's next sign-in, by when a page mounted at the sign-out has let its reads go.
 *
 * Never throws: it runs inside a sign-out or a sign-in, which must finish.
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
