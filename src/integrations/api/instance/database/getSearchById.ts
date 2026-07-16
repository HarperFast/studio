import { InstanceClientIdConfig } from '@/config/instanceClientConfig';
import { queryOptions } from '@tanstack/react-query';

interface SearchByIdParams extends InstanceClientIdConfig {
	enabled: boolean;
	databaseName: string;
	tableName: string;
	ids: unknown[] | null;
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
				onlyIfCached: true,
				operation: 'search_by_id',
				database: databaseName,
				table: tableName,
			}),
		enabled: enabled && !!validIds?.length,
		retry: false,
	});
}
