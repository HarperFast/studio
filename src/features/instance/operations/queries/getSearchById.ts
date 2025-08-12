import { instanceClient } from '@/config/instanceClient';
import { queryOptions } from '@tanstack/react-query';

function getSearchByIdOptions(
	isEditModalOpen: boolean,
	instanceId: string,
	databaseName: string,
	tableName: string,
	ids: unknown[] | null,
) {
	return queryOptions({
		queryKey: ['search_by_id', instanceId, databaseName, tableName, ids] as const,
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
		enabled: isEditModalOpen && !!ids?.length,
		retry: false,
	});
}

export { getSearchByIdOptions };
