import { instanceClient } from '@/config/instanceClient';

import { queryOptions } from '@tanstack/react-query';

type SearchConditions = {
	search_attribute: string;
	search_type: string;
	search_value: string;
};

type SearchByValueRequest = {
	operation: 'search_by_value',
	conditions?: [SearchConditions];
	schema: string;
	table: string;
	search_attribute: string;
	search_value: string;
	get_attributes?: string[];
	limit: number;
	offset: number;
	sort?: {
		attribute: string;
		descending: boolean;
	};
};

function getSearchByValueOptions({
	instanceId,
	schemaName,
	tableName,
	hash_attribute,
	sortTableDataParams,
	pagination,
}: {
	instanceId: string;
	schemaName: string;
	tableName: string;
	hash_attribute: string;
	sortTableDataParams: {
		attribute: string;
		descending: boolean;
	};
	pagination: {
		pageIndex: number;
		pageSize: number;
	};
}) {
	return queryOptions({
		queryKey: [
			'search_by_value',
			hash_attribute,
			instanceId,
			pagination.pageIndex || 0,
			pagination.pageSize || 0,
			schemaName,
			sortTableDataParams.attribute || 'default',
			sortTableDataParams.descending || false,
			tableName,
		] as const,
		staleTime: 5000,
		queryFn: () =>
			instanceClient.post<Record<string, unknown>[]>('/', {
				operation: 'search_by_value',
				get_attributes: ['*'],
				schema: schemaName,
				table: tableName,
				search_attribute: hash_attribute,
				search_value: '*',
				sort: sortTableDataParams.attribute.length ? sortTableDataParams : undefined,
				limit: pagination.pageSize,
				offset: pagination.pageIndex * pagination.pageSize,
			} satisfies SearchByValueRequest),
	});
}

export { getSearchByValueOptions };
