import { InstanceClientIdConfig } from '@/config/instanceClientConfig';
import { queryOptions } from '@tanstack/react-query';

interface SearchByIdParams extends InstanceClientIdConfig {
	enabled: boolean;
	databaseName: string;
	tableName: string;
	ids: unknown[] | null;
}

/**
 * The key prefix that invalidates every open-record query for this table.
 *
 * Exported so callers can't hand-build it: `DatabaseTableView`'s table-wide refresher keys on
 * `[entityId, databaseName, tableName]`, which silently does NOT match the key below — `'search_by_id'`
 * sits where that prefix expects the database name, so partial matching fails and a write left the row
 * editor's cached record intact. `searchByIdInvalidationKey` is asserted against the real query key in
 * this module's tests, so the two can't drift apart again.
 */
export function searchByIdInvalidationKey(entityId: string | undefined, databaseName: string, tableName: string) {
	return [entityId, 'search_by_id', databaseName, tableName] as const;
}

export function getSearchByIdOptions(
	{ enabled, entityId, instanceClient, databaseName, tableName, ids }: SearchByIdParams,
) {
	// A record whose declared primary key has no value surfaces here as `null`/`undefined`. Sending
	// it would JSON-serialize to `[null]`, which Harper rejects with a 500 ('hash_values' must be
	// strings or numbers) -- see #1199. Drop those so we never look a record up by a null key; the
	// caller (DatabaseTableView) detects the missing key up front and shows the row read-only instead.
	const validIds = ids?.filter((id) => id != null) ?? null;
	return queryOptions({
		queryKey: [entityId, 'search_by_id', databaseName, tableName, validIds] as const,
		queryFn: () =>
			instanceClient.post('/', {
				get_attributes: ['*'],
				ids: validIds,
				noCacheStore: true,
				// Fetch the actual record, not just a cached copy. Opening a row to view/edit it is a
				// deliberate lookup of one record, so `onlyIfCached: true` is wrong here -- on a cache
				// miss the server answers `{message: "Entry is not cached"}`, which the modal then renders
				// as the "record". With this off, a key that resolves to nothing returns an empty result
				// the caller can surface cleanly (see #1199).
				onlyIfCached: false,
				operation: 'search_by_id',
				database: databaseName,
				table: tableName,
			}),
		enabled: enabled && !!validIds?.length,
		retry: false,
	});
}
