import { instanceClient } from '@/config/instanceClient';
import { queryOptions } from '@tanstack/react-query';

function getSearchByIdOptions(
	isEditModalOpen: boolean,
	instanceId: string,
	schemaName: string,
	tableName: string,
	ids: unknown[] | null,
) {
	return queryOptions({
		queryKey: ['search_by_id', instanceId, schemaName, tableName, ids] as const,
		queryFn: () =>
			instanceClient.post('/', {
				get_attributes: ['*'],
				ids,
				noCacheStore: true,
				onlyIfCached: true,
				operation: 'search_by_id',
				schema: schemaName,
				table: tableName,
			}),
		enabled: isEditModalOpen && !!ids?.length,
		retry: false,
	});
}

export { getSearchByIdOptions };
