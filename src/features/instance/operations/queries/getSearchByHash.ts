import { instanceClient } from '@/config/instanceClient';
import { queryOptions } from '@tanstack/react-query';

function getSearchByHashOptions(
	isEditModalOpen: boolean,
	instanceId: string,
	schemaName: string,
	tableName: string,
	hashAttribute?: unknown,
) {
	return queryOptions({
		queryKey: ['search_by_hash', instanceId, schemaName, tableName, hashAttribute] as const,
		queryFn: () =>
			instanceClient.post('/', {
				operation: 'search_by_hash',
				noCacheStore: true,
				onlyIfCached: true,
				get_attributes: ['*'],
				hash_values: [hashAttribute],
				schema: schemaName,
				table: tableName,
				search_value: '*',
			}),
		enabled: isEditModalOpen && !!hashAttribute,
		retry: false,
	});
}

export { getSearchByHashOptions };
