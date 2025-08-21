import { InstanceClientIdConfig } from '@/config/instanceClientConfig';
import { queryOptions } from '@tanstack/react-query';

interface GetSearchByValueParams extends InstanceClientIdConfig {
	databaseName: string;
	tableName: string;
	searchAttribute: string;
	sortTableDataParams: {
		attribute: string;
		descending: boolean;
	};
	pagination: {
		pageIndex: number;
		pageSize: number;
	};
}

interface SearchConditions {
	search_attribute: string;
	search_type: string;
	search_value: string;
}

interface SearchByValueRequest {
	operation: 'search_by_value',
	conditions?: [SearchConditions];
	database: string;
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
}

export function getSearchByValueOptions({
	entityId,
	instanceClient,
	databaseName,
	tableName,
	searchAttribute,
	sortTableDataParams,
	pagination,
}: GetSearchByValueParams) {
	return queryOptions({
		queryKey: [
			entityId,
			'search_by_value',
			searchAttribute,
			pagination.pageIndex || 0,
			pagination.pageSize || 0,
			databaseName,
			sortTableDataParams.attribute || 'default',
			sortTableDataParams.descending || false,
			tableName,
		] as const,
		staleTime: 5_000,
		// refetchInterval: 10_000,
		queryFn: () =>
			instanceClient.post<Record<string, unknown>[]>('/', {
				operation: 'search_by_value',
				get_attributes: ['*'],
				database: databaseName,
				table: tableName,
				search_attribute: searchAttribute,
				search_value: '*',
				sort: sortTableDataParams.attribute.length ? sortTableDataParams : undefined,
				limit: pagination.pageSize,
				offset: pagination.pageIndex * pagination.pageSize,
			} satisfies SearchByValueRequest),
	});
}
