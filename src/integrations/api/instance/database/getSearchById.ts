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
	return queryOptions({
		queryKey: [entityId, 'search_by_id', databaseName, tableName, ids] as const,
		queryFn: () =>
			instanceClient.post('/', {
				get_attributes: ['*'],
				ids,
				noCacheStore: true,
				onlyIfCached: true,
				operation: 'search_by_id',
				database: databaseName,
				table: tableName,
			}),
		enabled: enabled && !!ids?.length,
		retry: false,
	});
}
