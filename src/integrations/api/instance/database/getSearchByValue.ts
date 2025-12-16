import { InstanceClientIdConfig } from '@/config/instanceClientConfig';
import { queryOptions } from '@tanstack/react-query';

interface GetSearchByValueParams extends InstanceClientIdConfig {
	enabled: boolean;
	databaseName: string;
	tableName: string;
	searchAttribute: string;
	sort: { attribute: string; descending: boolean };
	pageIndex: number;
	pageSize: number;
	onlyIfCached: boolean;
	headers?: Record<string, any>;
}

interface SearchByValueRequest {
	operation: 'search_by_value';
	database: string;
	table: string;
	search_attribute: string;
	search_value: string;
	sort?: { attribute: string; descending: boolean };
	offset: number;
	limit: number;
	get_attributes?: string[];
	onlyIfCached: boolean;
	noCacheStore: boolean;
}

export function getSearchByValueOptions(params: GetSearchByValueParams) {
	const {
		enabled,
		entityId,
		databaseName,
		tableName,
		searchAttribute,
		sort,
		pageIndex,
		pageSize,
		onlyIfCached,
	} = params;
	return queryOptions({
		enabled,
		queryKey: [
			entityId,
			databaseName,
			tableName,
			'search_by_value',
			searchAttribute,
			sort.attribute || 'default',
			sort.descending || false,
			pageIndex || 0,
			pageSize || 0,
			onlyIfCached,
		] as const,
		retry: false,
		staleTime: 60_000,
		gcTime: 5_000,
		queryFn: () => getSearchByValue(params),
	});
}

export function getSearchByValue({
	instanceClient,
	databaseName,
	tableName,
	searchAttribute,
	sort,
	pageIndex,
	pageSize,
	onlyIfCached,
	headers,
}: GetSearchByValueParams) {
	const customizedSort = sort.attribute.length && !(sort.attribute === searchAttribute && !sort.descending);
	return instanceClient.post<Record<string, unknown>[]>(
		'/',
		{
			operation: 'search_by_value',
			get_attributes: ['*'],
			database: databaseName,
			table: tableName,
			search_attribute: searchAttribute,
			search_value: '*',
			sort: customizedSort ? sort : undefined,
			offset: pageIndex * pageSize,
			limit: pageSize,
			onlyIfCached: onlyIfCached,
			noCacheStore: onlyIfCached,
		} satisfies SearchByValueRequest,
		{ timeout: 0, headers },
	);
}
