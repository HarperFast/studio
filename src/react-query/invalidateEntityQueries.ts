import type { InvalidateQueryFilters, QueryClient } from '@tanstack/react-query';

/** Invalidate every cached query that belongs to an entity (instance or
 *  cluster), regardless of key convention: entity-first keys
 *  (`[entityId, ...]`, e.g. databases/applications) and operation-first
 *  keys (`[operation, entityId, ...]`, e.g. `integrations/api/instance/status`)
 *  both match. Prefer this over `invalidateQueries({ queryKey: [entityId] })`,
 *  which silently misses the operation-first keys. */
export function invalidateEntityQueries(
	queryClient: QueryClient,
	entityId: string | undefined,
	options?: Pick<InvalidateQueryFilters, 'refetchType'>,
): Promise<void> {
	if (entityId === undefined) { return Promise.resolve(); }
	return queryClient.invalidateQueries({
		predicate: (query) => query.queryKey[0] === entityId || query.queryKey[1] === entityId,
		...options,
	});
}
