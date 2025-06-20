import { instanceClient } from '@/config/instanceClient';
import { queryOptions } from '@tanstack/react-query';

// type SearchConditions = {
// 	search_attribute: string;
// 	search_type: string;
// 	search_value: string;
// };

// type SearchByValueRequest = {
// 	conditions?: [SearchConditions];
// 	schema: string;
// 	table: string;
// 	search_attribute: string;
// 	search_value: string;
// 	// get_attributes: string[];
// 	limit: number;
// 	offset: number;
// };
function getSearchByHashOptions({
	instanceId,
	schemaName,
	tableName,
	hashAttribute,
}: // ...options
{
	instanceId: string;
	schemaName: string;
	tableName: string;
	hashAttribute: string[];
	// options?: SearchByValueRequest;
}) {
	return queryOptions({
		queryKey: [instanceId, 'search_by_hash'] as const,
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
		enabled: false,
		retry: false,
	});
}

export { getSearchByHashOptions };
