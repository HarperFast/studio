import { InstanceClientIdConfig } from '@/config/instanceClientConfig';
import { GetAttribute } from '@/features/instance/databases/functions/relationshipAttributes';
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
	/** Defaults to `['*']` (raw records). Pass nested selects to resolve relationship attributes. */
	getAttributes?: GetAttribute[];
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
	get_attributes?: GetAttribute[];
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
		getAttributes,
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
			getAttributes ?? null,
		] as const,
		retry: false,
		staleTime: 60_000,
		gcTime: 5_000,
		queryFn: () => getSearchByValue(params),
	});
}

export async function getSearchByValue<T = Record<string, unknown>>({
	instanceClient,
	databaseName,
	tableName,
	searchAttribute,
	sort,
	pageIndex,
	pageSize,
	onlyIfCached,
	getAttributes,
	headers,
}: Omit<GetSearchByValueParams, 'enabled'>) {
	const customizedSort = sort.attribute.length && !(sort.attribute === searchAttribute && !sort.descending);
	const response = await instanceClient.post<T[]>(
		'/',
		{
			operation: 'search_by_value',
			get_attributes: getAttributes ?? ['*'],
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
		{ timeout: 0, headers, validateStatus: (status) => status >= 200 && status < 400 || status === 404 },
	);
	if (response.status === 404) {
		return { data: [] };
	}
	return response;
}
